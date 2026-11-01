import { ModelsMethods } from "./clientModels";
import type { PluginChainEntry } from "./types";

export interface TelemetryEvent {
	name: string;
	properties: Record<string, unknown>;
	timestamp: string;
}

export interface TimelineBucket {
	bucket: string;
	count: number;
}

export class ChannelsMethods extends ModelsMethods {
	async listChannels(): Promise<
		Array<{
			id: string;
			name: string;
			is_default: boolean;
			device_ids: string[];
			created_at: string;
		}>
	> {
		return this.request("/channels");
	}

	async createChannel(data: { name: string; device_ids: string[] }): Promise<{
		id: string;
		name: string;
		is_default: boolean;
		device_ids: string[];
		created_at: string;
	}> {
		return this.request("/channels", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async updateChannel(
		channelId: string,
		data: {
			name?: string;
			device_ids?: string[];
		},
	): Promise<{
		id: string;
		name: string;
		is_default: boolean;
		device_ids: string[];
		created_at: string;
	}> {
		return this.request(`/channels/${channelId}`, {
			method: "PUT",
			body: JSON.stringify(data),
		});
	}

	async deleteChannel(channelId: string): Promise<{ message: string }> {
		return this.request(`/channels/${channelId}`, {
			method: "DELETE",
		});
	}

	async getChannelVoices(
		channelId: string,
	): Promise<{ profile_ids: string[] }> {
		return this.request(`/channels/${channelId}/voices`);
	}

	async setChannelVoices(
		channelId: string,
		profileIds: string[],
	): Promise<{ message: string }> {
		return this.request(`/channels/${channelId}/voices`, {
			method: "PUT",
			body: JSON.stringify({ profile_ids: profileIds }),
		});
	}

	async getPluginStatus() {
		const response = await this.fetchWithAuth("/plugins/status");
		return response.json();
	}

	async listPlugins() {
		const response = await this.fetchWithAuth("/plugins/list");
		return response.json();
	}

	async scanPlugins() {
		const response = await this.fetchWithAuth("/plugins/scan", {
			method: "POST",
		});
		return response.json();
	}

	async processPluginChain(audioPath: string, chain: PluginChainEntry[]) {
		const response = await this.fetchWithAuth(
			`/plugins/process?audio_path=${encodeURIComponent(audioPath)}`,
			{
				method: "POST",
				body: JSON.stringify({ chain }),
			},
		);
		return response.json();
	}

	getPluginPreviewUrl(audioPath: string, _chain: PluginChainEntry[]): string {
		const url = `${this.getBaseUrl()}/plugins/preview?audio_path=${encodeURIComponent(audioPath)}`;
		return url;
	}

	async previewPluginChain(
		audioPath: string,
		chain: PluginChainEntry[],
	): Promise<Blob> {
		const resp = await this.fetchWithAuth(
			`/plugins/preview?audio_path=${encodeURIComponent(audioPath)}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ chain }),
			},
		);
		if (!resp.ok) {
			const detail = await resp.json().catch(() => ({}));
			throw new Error(detail.detail || `HTTP ${resp.status}`);
		}
		return resp.blob();
	}

	// --- Phase 2: Scripting ---

	async listScriptingFunctions() {
		const response = await this.fetchWithAuth("/scripting/functions");
		return response.json();
	}

	async executeScriptingFunction(
		funcName: string,
		args: Record<string, unknown> = {},
	) {
		const response = await this.fetchWithAuth("/scripting/execute", {
			method: "POST",
			body: JSON.stringify({ function: funcName, args }),
		});
		return response.json();
	}

	// --- Phase 2: Community Presets ---

	async getTelemetryStatus() {
		const response = await this.fetchWithAuth("/telemetry/status");
		return response.json();
	}

	async toggleTelemetry(enabled: boolean) {
		const response = await this.fetchWithAuth("/telemetry/toggle", {
			method: "POST",
			body: JSON.stringify({ enabled }),
		});
		return response.json();
	}

	async getTelemetryEvents(params?: {
		event_type?: string;
		since?: string;
		limit?: number;
		offset?: number;
	}) {
		const query = new URLSearchParams();
		if (params?.event_type) query.set("event_type", params.event_type);
		if (params?.since) query.set("since", params.since);
		if (params?.limit) query.set("limit", String(params.limit));
		if (params?.offset) query.set("offset", String(params.offset));
		const qs = query.toString();
		const response = await this.fetchWithAuth(
			`/telemetry/events${qs ? `?${qs}` : ""}`,
		);
		return response.json();
	}

	async getTelemetrySummary() {
		const response = await this.fetchWithAuth("/telemetry/summary");
		return response.json();
	}

	async getTelemetryTimeline(params?: { since?: string; bucket?: string }) {
		const query = new URLSearchParams();
		if (params?.since) query.set("since", params.since);
		if (params?.bucket) query.set("bucket", params.bucket);
		const qs = query.toString();
		const response = await this.fetchWithAuth(
			`/telemetry/timeline${qs ? `?${qs}` : ""}`,
		);
		return response.json();
	}

	// --- Phase 2: Timecode ---

	async listCommunityPresets(category?: string, search?: string) {
		const params = new URLSearchParams();
		if (category) {
			params.set("category", category);
		}
		if (search) {
			params.set("search", search);
		}
		const response = await this.fetchWithAuth(
			`/community-presets?${params.toString()}`,
		);
		return response.json();
	}

	async listPresetCategories() {
		const response = await this.fetchWithAuth("/community-presets/categories");
		return response.json();
	}

	// --- Phase 2: Telemetry ---
}
