import type { LanguageCode } from "@/lib/constants/languages";
import { formatErrorDetail } from "./clientCore";
import { DubbingMethods } from "./clientDubbing";

export interface DiarizationSegment {
	start: number;
	end: number;
	text: string;
	speaker: string;
}

export interface DiarizationResponse {
	text: string;
	duration: number;
	segments: DiarizationSegment[];
	speakers: string[];
	diarized: boolean;
	language: string | null;
	model: string | null;
}

export class DiarizeMethods extends DubbingMethods {
	async diarizeAudio(
		file: File,
		opts?: { language?: LanguageCode; model?: string; numSpeakers?: number },
	): Promise<DiarizationResponse> {
		const formData = new FormData();
		formData.append("file", file);
		if (opts?.language) formData.append("language", opts.language);
		if (opts?.model) formData.append("model", opts.model);
		if (opts?.numSpeakers) formData.append("num_speakers", String(opts.numSpeakers));

		const url = `${this.getBaseUrl()}/diarize`;
		const response = await fetch(url, { method: "POST", body: formData });
		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(error.detail, `HTTP error! status: ${response.status}`),
			);
		}
		return response.json();
	}
}