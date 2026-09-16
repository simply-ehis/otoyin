import { debug } from "@/lib/utils/debug";
import { useServerStore } from "@/stores/serverStore";
import type { VocalQAResult } from "./types";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export function formatErrorDetail(detail: unknown, fallback: string): string {
	if (typeof detail === "string") {
		return detail;
	}
	if (Array.isArray(detail)) {
		return detail
			.map(
				(e: Record<string, unknown>) => e.msg || e.message || JSON.stringify(e),
			)
			.join("; ");
	}
	if (detail && typeof detail === "object") {
		const obj = detail as Record<string, unknown>;
		if (typeof obj.message === "string") {
			return obj.message;
		}
		return JSON.stringify(detail);
	}
	return fallback;
}

function getRetryAfterMs(response: Response, fallbackSec = 2): number {
	const raw = response.headers.get("Retry-After");
	if (!raw) return fallbackSec * 1000;
	const sec = parseInt(raw, 10);
	if (!Number.isNaN(sec)) return sec * 1000;
	// HTTP-date form — best-effort parse
	const dateMs = Date.parse(raw);
	if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
	return fallbackSec * 1000;
}

async function handleErrorResponse(response: Response): Promise<never> {
	if (response.status === 503) {
		// Server returns 503 + Retry-After while initializing (ReadinessMiddleware)
		const detail = (await response.json().catch(() => ({}))) as { detail?: unknown };
		const rawDetail = detail?.detail;
		if (rawDetail && typeof rawDetail === "object") {
			// Circuit breaker: engine cooling down after repeated failures.
			// retry_after_seconds is minutes-long — never auto-retry this.
			const obj = rawDetail as { code?: unknown; retry_after_seconds?: unknown; message?: unknown };
			if (obj.code === "engine_circuit_open") {
				const waitSec = typeof obj.retry_after_seconds === "number" ? obj.retry_after_seconds : 300;
				const err = new Error(
					typeof obj.message === "string" && obj.message.length > 0
						? obj.message
						: `Model temporarily unavailable — retry in about ${waitSec}s`,
				) as Error & { status?: number; retryAfterMs?: number; circuitOpen?: boolean };
				err.status = 503;
				err.retryAfterMs = waitSec * 1000;
				err.circuitOpen = true;
				throw err;
			}
		}
		const retryAfter = getRetryAfterMs(response, 2);
		const retrySec = Math.ceil(retryAfter / 1000);
		const msg =
			typeof rawDetail === "string" && rawDetail.toLowerCase().includes("initializing")
				? `Server is initializing — retry in ${retrySec}s`
				: formatErrorDetail(rawDetail ?? response.statusText, `Service unavailable (${response.status})`);
		const err = new Error(msg) as Error & { status?: number; retryAfterMs?: number };
		err.status = 503;
		err.retryAfterMs = retryAfter;
		throw err;
	}
	if (response.status === 429) {
		const retryAfter = response.headers.get("Retry-After");
		const parsed = retryAfter ? parseInt(retryAfter, 10) : NaN;
		const waitSeconds = Number.isNaN(parsed) ? 5 : parsed;
		throw new Error(
			`Rate limited. Please wait ${waitSeconds}s before trying again.`,
		);
	}
	if (response.status === 501) {
		let detail: unknown;
		try {
			detail = (await response.json())?.detail;
		} catch {
			detail = response.statusText;
		}
		throw new Error(formatErrorDetail(detail, "Feature not available — missing optional dependency"));
	}
	let detail: unknown;
	try {
		detail = (await response.json())?.detail;
	} catch {
		detail = response.statusText;
	}
	throw new Error(
		formatErrorDetail(detail, `HTTP error! status: ${response.status}`),
	);
}

function isNetworkError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message.toLowerCase();
	return (
		error.name === "TypeError" && // fetch throws TypeError on network failure
		(msg.includes("fetch") ||
			msg.includes("failed to fetch") ||
			msg.includes("network") ||
			msg.includes("load failed"))
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiClientCore {
	protected getBaseUrl(): string {
		const serverUrl = useServerStore.getState().serverUrl;
		return serverUrl;
	}

	/**
	 * Core fetch wrapper with timeout + abort-signal plumbing.
	 * Returns the raw Response — callers decide how to handle !ok.
	 */
	private async doFetch(
		url: string,
		options: RequestInit & { signal?: AbortSignal } | undefined,
		timeoutMs: number,
	): Promise<Response> {
		const isFormData = options?.body instanceof FormData;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		let externalAbortHandler: (() => void) | null = null;
		const externalSignal = options?.signal;
		if (externalSignal) {
			if (externalSignal.aborted) {
				controller.abort();
			} else {
				externalAbortHandler = () => controller.abort();
				externalSignal.addEventListener("abort", externalAbortHandler);
			}
		}

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
				headers: {
					...(isFormData ? {} : { "Content-Type": "application/json" }),
					...options?.headers,
				},
			});
			return response;
		} catch (err) {
			// Surface network/fetch failures as SIGNAL_LOST so inferStudioError maps correctly
			if (isNetworkError(err)) {
				throw new Error(
					`Signal lost — cannot reach ${url} — check that the backend is running (http://127.0.0.1:17493)`,
				);
			}
			if (err instanceof DOMException && err.name === "AbortError") {
				throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
			}
			throw err;
		} finally {
			clearTimeout(timeoutId);
			if (externalAbortHandler && externalSignal) {
				externalSignal.removeEventListener("abort", externalAbortHandler);
			}
		}
	}

	/**
	 * Fetch with automatic retry for 503 (server initializing) and transient
	 * network errors. Respects Retry-After header and uses exponential backoff.
	 */
	private async fetchWithRetry(
		url: string,
		options: RequestInit & { signal?: AbortSignal } | undefined,
		timeoutMs: number,
		maxRetries = 3,
	): Promise<Response> {
		let lastError: unknown;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const response = await this.doFetch(url, options, timeoutMs);
				if (response.status === 503 && attempt < maxRetries) {
					// Circuit-open 503s carry a minutes-long cooldown — retrying is pointless.
					const isCircuitOpen = await response
						.clone()
						.json()
						.then(
							(body) => (body as { detail?: { code?: string } })?.detail?.code === "engine_circuit_open",
							() => false,
						);
					if (isCircuitOpen) return response;
					const waitMs = getRetryAfterMs(response, 2);
					debug.log(`[api] ${url} → 503 initializing, retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
					await sleep(waitMs);
					continue;
				}
				return response;
			} catch (err) {
				lastError = err;
				// Don't retry on abort (user cancelled / timeout)
				if (err instanceof DOMException && err.name === "AbortError") throw err;
				if (isNetworkError(err) && attempt < maxRetries) {
					const backoff = 500 * 2 ** attempt; // 500, 1000, 2000
					debug.log(`[api] ${url} → network error, retry ${attempt + 1}/${maxRetries} in ${backoff}ms`);
					await sleep(backoff);
					continue;
				}
				throw err;
			}
		}
		throw lastError;
	}

	protected async request<T>(
		endpoint: string,
		options?: RequestInit & { signal?: AbortSignal },
		timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
	): Promise<T> {
		const url = `${this.getBaseUrl()}${endpoint}`;
		const response = await this.fetchWithRetry(url, options, timeoutMs);

		if (!response.ok) {
			await handleErrorResponse(response);
		}

		// 204 No Content — no JSON body
		if (response.status === 204) return undefined as unknown as T;

		try {
			return (await response.json()) as T;
		} catch (err) {
			debug.error(`[api] Failed to parse JSON from ${url}:`, err);
			throw new Error(`Invalid JSON response from ${endpoint}`);
		}
	}

	protected async fetchWithAuth(
		endpoint: string,
		options?: RequestInit & { signal?: AbortSignal },
		timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
	): Promise<Response> {
		const url = `${this.getBaseUrl()}${endpoint}`;
		const response = await this.fetchWithRetry(url, options, timeoutMs);

		if (!response.ok) {
			await handleErrorResponse(response);
		}

		return response;
	}

	/**
	 * POST to routes with scalar (query) params — e.g. /audio/copy,
	 * /audio/blend, /audio/separate. These routes take NO JSON body;
	 * posting one yields a 422, so params ride the query string.
	 */
	protected async postQuery<T>(
		endpoint: string,
		params: Record<string, string | number | boolean | undefined>,
	): Promise<T> {
		const q = new URLSearchParams();
		for (const [k, v] of Object.entries(params)) {
			if (v !== undefined) {
				q.set(k, String(v));
			}
		}
		return this.request<T>(`${endpoint}?${q.toString()}`, {
			method: "POST",
		});
	}

	async uploadAudio(file: File): Promise<{ audio_path: string; size: number }> {
		const formData = new FormData();
		formData.append("file", file);
		const resp = await this.fetchWithAuth("/dsp/upload", {
			method: "POST",
			body: formData,
		});
		return resp.json();
	}

	async vocalQA(generationId: string, lyrics: string, language?: string): Promise<VocalQAResult> {
		const resp = await this.fetchWithAuth("/audio/vocal-qa", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ generation_id: generationId, lyrics, language }),
		});
		return resp.json();
	}
}
