import type { LanguageCode } from "@/lib/constants/languages";
import { formatErrorDetail } from "./clientCore";
import { GenerationsMethods } from "./clientGenerations";
import type {
	AutomationParameters,
	CaptureCreateResponse,
	CaptureListResponse,
	CaptureReadinessResponse,
	CaptureRefineRequest,
	CaptureResponse,
	CaptureRetranscribeRequest,
	CaptureSettings,
	CaptureSettingsUpdate,
	CaptureSource,
	CrossfadeCurves,
	PerformanceSettings,
	PerformanceSettingsUpdate,
	WhisperModelSize,
} from "./types";

export class CapturesMethods extends GenerationsMethods {
	async listCaptures(limit = 50, offset = 0): Promise<CaptureListResponse> {
		return this.request<CaptureListResponse>(
			`/captures?limit=${limit}&offset=${offset}`,
		);
	}

	async getCapture(captureId: string): Promise<CaptureResponse> {
		return this.request<CaptureResponse>(`/captures/${captureId}`);
	}

	async createCapture(
		file: File,
		options?: {
			source?: CaptureSource;
			language?: LanguageCode;
			sttModel?: WhisperModelSize;
		},
	): Promise<CaptureCreateResponse> {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("source", options?.source ?? "file");
		if (options?.language) {
			formData.append("language", options.language);
		}
		if (options?.sttModel) {
			formData.append("stt_model", options.sttModel);
		}

		const url = `${this.getBaseUrl()}/captures`;
		const response = await fetch(url, { method: "POST", body: formData });
		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.json();
	}

	async deleteCapture(captureId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/captures/${captureId}`, {
			method: "DELETE",
		});
	}

	async refineCapture(
		captureId: string,
		body: CaptureRefineRequest,
	): Promise<CaptureResponse> {
		return this.request<CaptureResponse>(`/captures/${captureId}/refine`, {
			method: "POST",
			body: JSON.stringify(body),
		});
	}

	async retranscribeCapture(
		captureId: string,
		body: CaptureRetranscribeRequest,
	): Promise<CaptureResponse> {
		return this.request<CaptureResponse>(
			`/captures/${captureId}/retranscribe`,
			{
				method: "POST",
				body: JSON.stringify(body),
			},
		);
	}

	getCaptureAudioUrl(captureId: string): string {
		return `${this.getBaseUrl()}/captures/${captureId}/audio`;
	}

	// Settings

	async getPerformanceSettings(): Promise<PerformanceSettings> {
		return this.request<PerformanceSettings>("/settings/performance");
	}

	async updatePerformanceSettings(
		patch: PerformanceSettingsUpdate,
	): Promise<PerformanceSettings> {
		return this.request<PerformanceSettings>("/settings/performance", {
			method: "PUT",
			body: JSON.stringify(patch),
		});
	}

	async getCaptureSettings(): Promise<CaptureSettings> {
		return this.request<CaptureSettings>("/settings/captures");
	}

	async getCaptureReadiness(): Promise<CaptureReadinessResponse> {
		return this.request<CaptureReadinessResponse>("/capture/readiness");
	}

	async updateCaptureSettings(
		patch: CaptureSettingsUpdate,
	): Promise<CaptureSettings> {
		return this.request<CaptureSettings>("/settings/captures", {
			method: "PUT",
			body: JSON.stringify(patch),
		});
	}

	async getAutomationParameters(): Promise<AutomationParameters> {
		return this.request("/automation/parameters");
	}

	async getCrossfadeCurves(): Promise<CrossfadeCurves> {
		return this.request("/automation/crossfade-curves");
	}

	async interpolateAutomationPoints(
		points: number[][],
		curve: string = "linear",
	): Promise<{ envelope: number[][] }> {
		return this.request("/automation/interpolate", {
			method: "POST",
			body: JSON.stringify({ points, curve }),
		});
	}

	// --- Audio Bridge ---
}
