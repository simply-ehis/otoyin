/**
 * Instrument pack API methods (library management, ported from Resonant).
 * Chained into ApiClient via extend(ClientInstrumentPackMethods).
 */
import { ClientLauncherMethods } from "./clientLauncher";
import type {
	InstrumentPackResponse,
	InstrumentUploadResponse,
} from "./types";

export class ClientInstrumentPackMethods extends ClientLauncherMethods {
	async listInstrumentPacks(): Promise<InstrumentPackResponse[]> {
		const response = await this.fetchWithAuth("/instrument-packs");
		if (!response.ok) throw new Error("Failed to list instrument packs");
		return response.json();
	}

	async uploadInstrumentPack(
		file: File,
		name?: string,
	): Promise<InstrumentUploadResponse> {
		const formData = new FormData();
		formData.append("file", file);
		if (name) {
			formData.append("name", name);
		}
		const response = await this.fetchWithAuth("/instrument-packs/upload", {
			method: "POST",
			body: formData,
			headers: {},
		});
		if (!response.ok) throw new Error("Failed to upload instrument pack");
		return response.json();
	}

	async getInstrumentPack(packId: string): Promise<InstrumentPackResponse> {
		const response = await this.fetchWithAuth(
			`/instrument-packs/${packId}`,
		);
		if (!response.ok) throw new Error("Failed to get instrument pack");
		return response.json();
	}

	async deleteInstrumentPack(packId: string): Promise<void> {
		const response = await this.fetchWithAuth(
			`/instrument-packs/${packId}`,
			{ method: "DELETE" },
		);
		if (!response.ok) throw new Error("Failed to delete instrument pack");
	}
}
