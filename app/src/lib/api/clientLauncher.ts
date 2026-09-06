/**
 * Launcher session API methods (clip grid + scenes, ported from Resonant).
 * Chained into ApiClient via extend(ClientLauncherMethods).
 */
import { SongwriterMethods } from "./clientSongwriter";
import type {
	LauncherCaptureResponse,
	LauncherSessionCreate,
	LauncherSessionResponse,
} from "./types";

export class ClientLauncherMethods extends SongwriterMethods {
	async listLauncherSessions(): Promise<LauncherSessionResponse[]> {
		const response = await this.fetchWithAuth("/launcher/sessions");
		if (!response.ok) throw new Error("Failed to list launcher sessions");
		return response.json();
	}

	async createLauncherSession(
		data: LauncherSessionCreate,
	): Promise<LauncherSessionResponse> {
		const response = await this.fetchWithAuth("/launcher/sessions", {
			method: "POST",
			body: JSON.stringify(data),
		});
		if (!response.ok) throw new Error("Failed to create launcher session");
		return response.json();
	}

	async getLauncherSession(
		sessionId: string,
	): Promise<LauncherSessionResponse> {
		const response = await this.fetchWithAuth(
			`/launcher/sessions/${sessionId}`,
		);
		if (!response.ok) throw new Error("Failed to get launcher session");
		return response.json();
	}

	async updateLauncherSession(
		sessionId: string,
		data: LauncherSessionCreate,
	): Promise<LauncherSessionResponse> {
		const response = await this.fetchWithAuth(
			`/launcher/sessions/${sessionId}`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
		if (!response.ok) throw new Error("Failed to update launcher session");
		return response.json();
	}

	async deleteLauncherSession(sessionId: string): Promise<void> {
		const response = await this.fetchWithAuth(
			`/launcher/sessions/${sessionId}`,
			{ method: "DELETE" },
		);
		if (!response.ok) throw new Error("Failed to delete launcher session");
	}

	async captureLauncherSession(
		sessionId: string,
		activeClips?: Record<string, string | null>,
	): Promise<LauncherCaptureResponse> {
		const response = await this.fetchWithAuth(
			`/launcher/sessions/${sessionId}/capture`,
			{
				method: "POST",
				body: JSON.stringify({ activeClips: activeClips ?? null }),
			},
		);
		if (!response.ok) throw new Error("Failed to capture launcher session");
		return response.json();
	}
}
