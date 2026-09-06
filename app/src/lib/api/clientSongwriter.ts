import { AudiobooksMethods } from "./clientAudiobooks";
import type {
	SongDraftCreate,
	SongDraftResponse,
} from "./types";

export class SongwriterMethods extends AudiobooksMethods {
	async listSongDrafts(): Promise<SongDraftResponse[]> {
		return this.request<SongDraftResponse[]>("/song-drafts");
	}

	async getSongDraft(draftId: string): Promise<SongDraftResponse> {
		return this.request<SongDraftResponse>(`/song-drafts/${draftId}`);
	}

	async createSongDraft(data: SongDraftCreate): Promise<SongDraftResponse> {
		return this.request<SongDraftResponse>("/song-drafts", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async updateSongDraft(
		draftId: string,
		data: SongDraftCreate,
	): Promise<SongDraftResponse> {
		return this.request<SongDraftResponse>(`/song-drafts/${draftId}`, {
			method: "PUT",
			body: JSON.stringify(data),
		});
	}

	async deleteSongDraft(draftId: string): Promise<void> {
		await this.request<void>(`/song-drafts/${draftId}`, {
			method: "DELETE",
		});
	}
}
