import { ApiClientCore } from "./clientCore";

export interface DeleteConfirmResponse {
	confirmation_token: string;
}

/**
 * Privacy API methods — data export and deletion.
 * Chained into ApiClient via CrashesMethods → ProfilesMethods → ...
 */
export class ClientPrivacyMethods extends ApiClientCore {
	async exportData(): Promise<Blob> {
		const resp = await this.fetchWithAuth("/v1/privacy/export", {
			method: "POST",
		});
		if (!resp.ok) {
			const detail = await resp.json().catch(() => ({}));
			throw new Error(detail.detail || `Export failed: ${resp.status}`);
		}
		return resp.blob();
	}

	async requestDeleteConfirm(): Promise<DeleteConfirmResponse> {
		return this.request<DeleteConfirmResponse>(
			"/v1/privacy/delete/confirm",
			{
				method: "POST",
				body: JSON.stringify({}),
			},
		);
	}

	async confirmDelete(confirmationToken: string): Promise<void> {
		await this.request<void>("/v1/privacy/delete", {
			method: "POST",
			body: JSON.stringify({ confirmation_token: confirmationToken }),
		});
	}
}
