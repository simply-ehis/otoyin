import { ApiClientCore, formatErrorDetail } from "./clientCore";

export interface DeleteConfirmResponse {
	confirmation_token: string;
}

/**
 * Privacy API methods — data export and deletion.
 * Chained into ApiClient via CrashesMethods → ProfilesMethods → ...
 */
export class ClientPrivacyMethods extends ApiClientCore {
	async exportData(): Promise<Blob> {
		const url = `${this.getBaseUrl()}/v1/privacy/export`;
		const response = await fetch(url, { method: "POST" });

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`Export failed: ${response.status}`,
				),
			);
		}

		return response.blob();
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
