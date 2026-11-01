import type { LanguageCode } from "@/lib/constants/languages";
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

		const resp = await this.fetchWithAuth("/diarize", {
			method: "POST",
			body: formData,
		});
		if (!resp.ok) {
			const detail = await resp.json().catch(() => ({}));
			throw new Error(detail.detail || `Diarize failed (${resp.status})`);
		}
		return resp.json();
	}

	async diarizePath(
		audioPath: string,
		opts?: { language?: LanguageCode; model?: string; numSpeakers?: number },
	): Promise<DiarizationResponse> {
		const resp = await this.fetchWithAuth("/diarize/path", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				language: opts?.language,
				model: opts?.model,
				num_speakers: opts?.numSpeakers,
			}),
		});
		if (!resp.ok) {
			const detail = await resp.json().catch(() => ({}));
			throw new Error(detail.detail || `Diarize path failed (${resp.status})`);
		}
		return resp.json();
	}
}