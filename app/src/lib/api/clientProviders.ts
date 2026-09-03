import { ApiClientCore } from "./clientCore";

export interface ModelProvider {
	id: string;
	domain: string;
	name: string;
	base_url: string;
	model: string | null;
	is_default: boolean;
	has_api_key: boolean;
	created_at: string | null;
	updated_at: string | null;
}

export interface ProviderCreate {
	domain: string;
	name: string;
	base_url: string;
	api_key?: string;
	model?: string;
	is_default?: boolean;
}

export interface ProviderUpdate {
	domain?: string;
	name?: string;
	base_url?: string;
	api_key?: string;
	model?: string;
	is_default?: boolean;
}

class ModelProvidersClient extends ApiClientCore {
	async list(domain?: string): Promise<ModelProvider[]> {
		const params = domain ? `?domain=${domain}` : "";
		return this.request<ModelProvider[]>(`/model-providers${params}`);
	}

	async get(id: string): Promise<ModelProvider> {
		return this.request<ModelProvider>(`/model-providers/${id}`);
	}

	async create(data: ProviderCreate): Promise<ModelProvider> {
		return this.request<ModelProvider>("/model-providers", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async update(id: string, patch: ProviderUpdate): Promise<ModelProvider> {
		return this.request<ModelProvider>(`/model-providers/${id}`, {
			method: "PATCH",
			body: JSON.stringify(patch),
		});
	}

	async delete(id: string): Promise<void> {
		await this.request(`/model-providers/${id}`, { method: "DELETE" });
	}
}

export const modelProvidersClient = new ModelProvidersClient();
