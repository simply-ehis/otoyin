import { ApiClientLibrary } from "./clientLibrary";
import type { VoiceProfileResponse } from "./types";

export interface AudiobookSummary {
	id: string;
	title: string;
	author?: string | null;
	description?: string | null;
	cover_path?: string | null;
	source_type?: string | null;
	total_duration_ms?: number | null;
	created_at: string;
	updated_at: string;
	chapter_count: number;
}
export interface Chapter {
	id: string;
	audiobook_id: string;
	order_index: number;
	title: string;
	text: string;
	word_count?: number | null;
	status: string;
	audio_path?: string | null;
	duration_ms?: number | null;
	error?: string | null;
	generation_id?: string | null;
}
export interface Utterance {
	id: string;
	chapter_id: string;
	audiobook_id: string;
	order_index: number;
	character: string;
	text: string;
	profile_id?: string | null;
	engine?: string | null;
	audio_path?: string | null;
	duration_ms?: number | null;
	status: string;
	error?: string | null;
}
export interface AudiobookDetail extends AudiobookSummary {
	chapters: Chapter[];
	cast: Array<{ character: string; profile_id?: string | null; engine?: string | null }>;
	utterances: Utterance[];
}

export class AudiobooksMethods extends ApiClientLibrary {
	async listAudiobooks(): Promise<AudiobookSummary[]> {
		return this.request<AudiobookSummary[]>("/audiobooks");
	}
	async createAudiobook(data: { title: string; author?: string; description?: string }): Promise<AudiobookSummary> {
		return this.request<AudiobookSummary>("/audiobooks", { method: "POST", body: JSON.stringify(data) });
	}
	async getAudiobook(id: string): Promise<AudiobookDetail> {
		return this.request<AudiobookDetail>(`/audiobooks/${id}`);
	}
	async deleteAudiobook(id: string): Promise<void> {
		await this.request<void>(`/audiobooks/${id}`, { method: "DELETE" });
	}
	async previewBook(file: File): Promise<{ title: string; has_cover: boolean; chapters: Array<{ index: number; title: string; word_count: number; preview: string }> }> {
		const form = new FormData();
		form.append("file", file);
		const res = await fetch(`${this.getBaseUrl()}/audiobooks/preview`, { method: "POST", body: form });
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}
	async importBook(file: File, title?: string, author?: string): Promise<AudiobookDetail> {
		const form = new FormData();
		form.append("file", file);
		if (title) form.append("title", title);
		if (author) form.append("author", author);
		const res = await fetch(`${this.getBaseUrl()}/audiobooks/import`, { method: "POST", body: form });
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}
	async uploadCover(bookId: string, file: File): Promise<{ cover_path: string }> {
		const form = new FormData();
		form.append("file", file);
		const res = await fetch(`${this.getBaseUrl()}/audiobooks/${bookId}/cover`, { method: "POST", body: form });
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}
	async listCast(bookId: string): Promise<{ cast: Array<{ character: string; profile_id?: string | null; engine?: string | null }> }> {
		return this.request(`/audiobooks/${bookId}/cast`);
	}
	async upsertCast(bookId: string, data: { character: string; profile_id?: string | null; engine?: string | null }) {
		return this.request(`/audiobooks/${bookId}/cast`, { method: "PUT", body: JSON.stringify(data) });
	}
	async suggestCast(bookId: string): Promise<{ characters: Array<{ character: string; traits?: string; gender?: string; confidence?: number; suggested_profile_id?: string | null; suggested_profile_name?: string | null }>; profiles: VoiceProfileResponse[] }> {
		return this.request(`/audiobooks/${bookId}/cast/suggest`, { method: "POST", body: JSON.stringify({}) });
	}
	async renderBook(bookId: string, opts?: { profile_id?: string | null; engine?: string | null }): Promise<{ job_id: string }> {
		return this.request(`/audiobooks/${bookId}/render`, { method: "POST", body: JSON.stringify(opts ?? {}) });
	}
	async exportWav(bookId: string): Promise<Blob> {
		const res = await fetch(`${this.getBaseUrl()}/audiobooks/${bookId}/export`);
		if (!res.ok) throw new Error(await res.text());
		return res.blob();
	}
	async exportM4b(bookId: string, bitrate = "64k"): Promise<Blob> {
		const res = await fetch(`${this.getBaseUrl()}/audiobooks/${bookId}/export-m4b?bitrate=${bitrate}`);
		if (!res.ok) throw new Error(await res.text());
		return res.blob();
	}
	async listFormats(): Promise<{ formats: Record<string, { ext: string; codec: string; mime: string }>; ffmpeg_available: boolean }> {
		return this.request("/audiobooks/formats");
	}
	async listCachedEngines(): Promise<{ engines: Array<{ engine: string; model_name: string; display_name: string; model_size: string }> }> {
		return this.request("/audiobooks/cached-engines");
	}
	async parseChapterScript(bookId: string, chapterId: string): Promise<Utterance[]> {
		return this.request<Utterance[]>(`/audiobooks/${bookId}/chapters/${chapterId}/parse-script`, { method: "POST" });
	}
	async listUtterances(bookId: string, chapterId: string): Promise<Utterance[]> {
		return this.request<Utterance[]>(`/audiobooks/${bookId}/chapters/${chapterId}/utterances`);
	}
	async clearUtterances(bookId: string, chapterId: string): Promise<void> {
		await this.request<void>(`/audiobooks/${bookId}/chapters/${chapterId}/utterances`, { method: "DELETE" });
	}
}
