import { CapturesMethods } from "./clientCaptures";
import type {
	ActiveTasksResponse,
	AssistantSettings,
	AssistantSettingsUpdate,
	CudaStatus,
	DeviceCapabilitiesResponse,
	MCPClientBinding,
	MCPClientBindingListResponse,
	MCPClientBindingUpsert,
	ModelCapabilitiesResponse,
	ModelDownloadRequest,
	ModelStatusListResponse,
	RecommendedModelsResponse,
} from "./types";

export class ModelsMethods extends CapturesMethods {
	async getModelStatus(): Promise<ModelStatusListResponse> {
		return this.request<ModelStatusListResponse>("/models/status");
	}

	async getModelCapabilities(): Promise<ModelCapabilitiesResponse> {
		return this.request<ModelCapabilitiesResponse>("/models/capabilities");
	}

	async getRecommendedModels(): Promise<RecommendedModelsResponse> {
		return this.request<RecommendedModelsResponse>("/models/recommended");
	}

	async getDeviceCapabilities(): Promise<DeviceCapabilitiesResponse> {
		return this.request<DeviceCapabilitiesResponse>("/device/capabilities");
	}

	async getModelsCacheDir(): Promise<{ path: string }> {
		return this.request<{ path: string }>("/models/cache-dir");
	}

	async migrateModels(destination: string): Promise<{
		source: string;
		destination: string;
		moved: number;
		errors: string[];
	}> {
		return this.request("/models/migrate", {
			method: "POST",
			body: JSON.stringify({ destination }),
		});
	}

	getMigrationProgressUrl(): string {
		return `${this.getBaseUrl()}/models/migrate/progress`;
	}

	async triggerModelDownload(modelName: string): Promise<{ message: string }> {
		const result = await this.request<{ message: string }>("/models/download", {
			method: "POST",
			body: JSON.stringify({ model_name: modelName } as ModelDownloadRequest),
		});
		return result;
	}

	async deleteModel(modelName: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/models/${modelName}`, {
			method: "DELETE",
		});
	}

	async unloadModel(modelName: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/models/${modelName}/unload`, {
			method: "POST",
		});
	}

	async loadModel(
		engine: string,
		modelSize = "default",
	): Promise<{ message: string }> {
		return this.request<{ message: string }>(
			`/models/load?engine=${encodeURIComponent(engine)}&model_size=${encodeURIComponent(modelSize)}`,
		);
	}

	async cancelDownload(modelName: string): Promise<{ message: string }> {
		return this.request<{ message: string }>("/models/download/cancel", {
			method: "POST",
			body: JSON.stringify({ model_name: modelName } as ModelDownloadRequest),
		});
	}

	// Task Management

	async getActiveTasks(): Promise<ActiveTasksResponse> {
		return this.request<ActiveTasksResponse>("/tasks/active");
	}

	async clearAllTasks(): Promise<{ message: string }> {
		return this.request<{ message: string }>("/tasks/clear", {
			method: "POST",
		});
	}

	// Audio Channels

	async getCudaStatus(): Promise<CudaStatus> {
		return this.request<CudaStatus>("/backend/cuda-status");
	}

	async downloadCudaBackend(): Promise<{
		message: string;
		progress_key: string;
	}> {
		return this.request<{ message: string; progress_key: string }>(
			"/backend/download-cuda",
			{
				method: "POST",
			},
		);
	}

	async deleteCudaBackend(): Promise<{ message: string }> {
		return this.request<{ message: string }>("/backend/cuda", {
			method: "DELETE",
		});
	}

	// Stories

	async getAssistantSettings(): Promise<AssistantSettings> {
		return this.request<AssistantSettings>("/settings/assistant");
	}

	async updateAssistantSettings(
		patch: AssistantSettingsUpdate,
	): Promise<AssistantSettings> {
		return this.request<AssistantSettings>("/settings/assistant", {
			method: "PUT",
			body: JSON.stringify(patch),
		});
	}

	async getAssistantSystemPromptDefault(): Promise<string> {
		const data = await this.request<{ default: string }>(
			"/assistant/system-prompt-default",
		);
		return data.default ?? "";
	}

	// MCP bindings — per-MCP-client voice/engine/personality mapping.

	async listMCPBindings(): Promise<MCPClientBindingListResponse> {
		return this.request<MCPClientBindingListResponse>("/mcp/bindings");
	}

	async upsertMCPBinding(
		data: MCPClientBindingUpsert,
	): Promise<MCPClientBinding> {
		return this.request<MCPClientBinding>("/mcp/bindings", {
			method: "PUT",
			body: JSON.stringify(data),
		});
	}

	async deleteMCPBinding(clientId: string): Promise<{ deleted: string }> {
		return this.request<{ deleted: string }>(
			`/mcp/bindings/${encodeURIComponent(clientId)}`,
			{
				method: "DELETE",
			},
		);
	}

	// Model Management

	async listImportFormats() {
		const response = await this.fetchWithAuth("/import/formats");
		return response.json();
	}

	async getAudioInfo(filePath: string) {
		const response = await this.fetchWithAuth(
			`/import/info?file_path=${encodeURIComponent(filePath)}`,
		);
		return response.json();
	}

	// --- Phase 2: Shortcuts ---

	async convertAudio(
		inputPath: string,
		targetFormat: string,
		sampleRate: number = 44100,
		channels: number = 1,
		sanitize = false,
	) {
		const response = await this.fetchWithAuth("/import/convert", {
			method: "POST",
			body: JSON.stringify({
				input_path: inputPath,
				target_format: targetFormat,
				sample_rate: sampleRate,
				channels,
				sanitize,
			}),
		});
		return response.json();
	}

	async extractAudioFromVideo(
		videoPath: string,
		sampleRate: number = 44100,
		channels: number = 1,
	) {
		const response = await this.fetchWithAuth("/import/extract-audio", {
			method: "POST",
			body: JSON.stringify({
				video_path: videoPath,
				sample_rate: sampleRate,
				channels,
			}),
		});
		return response.json();
	}

	async listKeymaps() {
		const response = await this.fetchWithAuth("/shortcuts/keymaps");
		return response.json();
	}

	async getKeymap(keymap: string) {
		const response = await this.fetchWithAuth("/shortcuts/keymap", {
			method: "POST",
			body: JSON.stringify({ keymap }),
		});
		return response.json();
	}

	// --- Phase 2: Plugins ---
}
