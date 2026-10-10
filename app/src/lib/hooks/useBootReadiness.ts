import { useEffect, useState } from "react";

export interface BootState {
	ready: boolean;
	status: string;
	error?: string;
	elapsed: number;
}

const IDLE: BootState = { ready: false, status: "waiting", elapsed: 0 };

/**
 * Boot gate: poll /health/ready until the backend accepts traffic.
 * Unlike the background health query (which gives up after a few
 * retries), this never stops — a cold backend takes minutes, and the
 * alternative is a shell full of failing queries that looks broken.
 *
 * The poller is module-scoped and ref-counted rather than per-hook. The
 * router gate and BackendStatusBanner both need this signal, and two
 * independent pollers doubled the request rate against the same endpoint
 * (18 requests in 20s observed). One shared poller serves every caller.
 */
let state: BootState = IDLE;
let startedAt = 0;
let serverUrl = "";
let timer: number | null = null;
let controller: AbortController | null = null;
let inFlight = false;
let subscribers = 0;

const listeners = new Set<(next: BootState) => void>();

function publish(next: BootState) {
	state = next;
	for (const listener of listeners) listener(state);
}

async function poll() {
	if (inFlight || subscribers === 0) return;
	inFlight = true;
	const ctrl = new AbortController();
	controller = ctrl;
	const timeoutId = window.setTimeout(() => ctrl.abort(), 5000);
	try {
		const base = serverUrl.replace(/\/$/, "");
		const res = await fetch(`${base}/health/ready`, { signal: ctrl.signal });
		if (!res.ok) throw new Error(`health/ready ${res.status}`);
		const data = (await res.json()) as {
			ready?: boolean;
			status?: string;
			error?: string;
		};
		publish({
			ready: data.ready === true,
			status: data.status ?? "initializing",
			error: data.error,
			elapsed: Math.floor((Date.now() - startedAt) / 1000),
		});
	} catch {
		publish({
			...state,
			ready: false,
			status: "waiting",
			elapsed: Math.floor((Date.now() - startedAt) / 1000),
		});
	} finally {
		window.clearTimeout(timeoutId);
		if (controller === ctrl) controller = null;
		inFlight = false;
	}
}

function stop() {
	if (timer !== null) window.clearInterval(timer);
	timer = null;
	controller?.abort();
	controller = null;
	inFlight = false;
	state = IDLE;
	startedAt = 0;
	serverUrl = "";
}

/** Subscribe to the shared boot state. Returns an unsubscribe function. */
export function subscribeBootReadiness(
	url: string,
	onChange: (s: BootState) => void,
) {
	subscribers += 1;
	listeners.add(onChange);
	onChange(state);

	if (timer === null) {
		serverUrl = url;
		startedAt = Date.now();
		void poll();
		timer = window.setInterval(() => void poll(), 1500);
	} else if (url !== serverUrl) {
		// Backend address changed (adopted a different port) — repoint and
		// re-probe immediately rather than waiting out the current interval.
		serverUrl = url;
		startedAt = Date.now();
		publish(IDLE);
		void poll();
	}

	return () => {
		listeners.delete(onChange);
		subscribers -= 1;
		if (subscribers === 0) stop();
	};
}

export function useBootReadiness(url: string): BootState {
	const [local, setLocal] = useState<BootState>(IDLE);
	useEffect(() => subscribeBootReadiness(url, setLocal), [url]);
	return local;
}
