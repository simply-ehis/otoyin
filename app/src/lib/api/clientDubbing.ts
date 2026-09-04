import { ContentMethods } from "./clientContent";

export interface DubSegment {
	id: number;
	start: number;
	end: number;
	original_text: string;
	translated_text: string;
	speaker: string;
	has_audio: boolean;
}

export interface DubJobResponse {
	job_id: string;
	status: string;
	progress: number;
	source_lang: string | null;
	target_lang: string;
	total_segments: number;
	completed_segments: number;
	segments: DubSegment[];
	output_path: string | null;
	error: string | null;
	duration?: number;
}

export interface DubPreviewSegment {
	id: number;
	start: number;
	end: number;
	text: string;
	speaker: string;
}

export interface DubPreviewResponse {
	segments: DubPreviewSegment[];
	detected_speakers: string[];
}

export class DubbingMethods extends ContentMethods {
	async startDub(params: {
		video_path: string;
		target_lang: string;
		profile_id: string;
		engine?: string;
		source_lang?: string | null;
		num_speakers?: number | null;
	}): Promise<{ job_id: string; status: string }> {
		return this.request("/dubbing/dub", {
			method: "POST",
			body: JSON.stringify(params),
		});
	}

	async getDubJob(job_id: string): Promise<DubJobResponse> {
		return this.request(`/dubbing/job/${job_id}`, {
			method: "GET",
		});
	}

	async cancelDub(job_id: string): Promise<{ cancelled: boolean }> {
		return this.request(`/dubbing/cancel/${job_id}`, {
			method: "POST",
		});
	}

	async downloadDubbedVideo(job_id: string): Promise<Blob> {
		const res = await this.fetchWithAuth(
			`/dubbing/download/${job_id}`,
			{
				method: "GET",
				headers: {
					Accept: "video/mp4",
				},
			},
			600_000,
		);
		return res.blob();
	}

	async previewDub(params: {
		video_path: string;
		source_lang?: string | null;
		num_speakers?: number | null;
	}): Promise<DubPreviewResponse> {
		return this.request("/dubbing/preview", {
			method: "POST",
			body: JSON.stringify(params),
		});
	}

	async getDubbingLanguages(): Promise<{ languages: string[] }> {
		return this.request("/dubbing/languages", { method: "GET" });
	}
}

export const dubbingClient = new DubbingMethods();