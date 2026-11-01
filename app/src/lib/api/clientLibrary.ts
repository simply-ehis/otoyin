import { DiarizeMethods } from "./clientDiarize";
import type { LibraryItem, LibraryListResponse, LibraryTag } from "./types";

export class ApiClientLibrary extends DiarizeMethods {
	async listLibrary(params: {
		q?: string;
		kind?: string;
		tag?: string;
		sort?: string;
		page?: number;
		limit?: number;
	}): Promise<LibraryListResponse> {
		const sp = new URLSearchParams();
		if (params.q) sp.set("q", params.q);
		if (params.kind) sp.set("kind", params.kind);
		if (params.tag) sp.set("tag", params.tag);
		if (params.sort) sp.set("sort", params.sort);
		if (params.page) sp.set("page", String(params.page));
		if (params.limit) sp.set("limit", String(params.limit));
		const qs = sp.toString();
		return this.request<LibraryListResponse>(`/library${qs ? `?${qs}` : ""}`);
	}

	async listLibraryTags(): Promise<LibraryTag[]> {
		return this.request<LibraryTag[]>("/library/tags");
	}

	async createLibraryTag(name: string, color?: string): Promise<LibraryTag> {
		return this.request<LibraryTag>("/library/tags", {
			method: "POST",
			body: JSON.stringify({ name, color }),
		});
	}

	async deleteLibraryTag(tagId: string): Promise<void> {
		await this.request<void>(`/library/tags/${tagId}`, { method: "DELETE" });
	}

	async addTagToItem(kind: string, id: string, tagId?: string, tagName?: string, color?: string): Promise<LibraryTag> {
		return this.request<LibraryTag>(`/library/items/${kind}/${id}/tags`, {
			method: "POST",
			body: JSON.stringify({ tag_id: tagId, tag_name: tagName, color }),
		});
	}

	async removeTagFromItem(kind: string, id: string, tagId: string): Promise<void> {
		await this.request<void>(`/library/items/${kind}/${id}/tags/${tagId}`, { method: "DELETE" });
	}

	async batchDelete(items: { kind: string; id: string }[]): Promise<{ deleted: number }> {
		return this.request<{ deleted: number }>("/library/batch/delete", {
			method: "POST",
			body: JSON.stringify({ items }),
		});
	}

	async batchTag(
		items: { kind: string; id: string }[],
		opts: { tag_id?: string; tag_name?: string; color?: string; action: "add" | "remove" },
	): Promise<{ tag: LibraryTag; affected: number }> {
		return this.request<{ tag: LibraryTag; affected: number }>("/library/batch/tag", {
			method: "POST",
			body: JSON.stringify({ items, ...opts }),
		});
	}

	getLibraryAudioUrl(item: LibraryItem): string {
		if (item.audio_url) {
			const base = this.getBaseUrl();
			if (item.audio_url.startsWith("http")) return item.audio_url;
			return `${base}${item.audio_url}`;
		}
		return "";
	}

	async saveGeneratedAudio(
		file: Blob | File,
		title: string,
		kind: "capture" | "generation" = "capture",
		source: string = "file",
	): Promise<{
		id: string;
		kind: string;
		title: string;
		audio_path: string;
		duration_ms: number | null;
		created_at: string;
	}> {
		const form = new FormData();
		form.append("file", file, "audio.wav");
		form.append("title", title);
		form.append("kind", kind);
		form.append("source", source);
		const res = await this.fetchWithAuth("/library/save-generated-audio", {
			method: "POST",
			body: form,
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ detail: res.statusText }));
			throw new Error(
				`${error.detail || `HTTP error! status: ${res.status}`}`,
			);
		}
		return res.json();
	}
}
