import { formatErrorDetail } from "./clientCore";

import { StoriesBMethods } from "./clientStoriesB";

export class ADRMethods extends StoriesBMethods {
	async createADRSession(
		name: string,
		lines: Array<{
			line_id: string;
			original_text: string;
			character: string;
			target_duration_ms?: number;
			timecode_in?: string;
			timecode_out?: string;
		}>,
	) {
		const response = await this.fetchWithAuth("/adr/sessions", {
			method: "POST",
			body: JSON.stringify({ name, lines }),
		});
		return response.json();
	}

	async listADRSessions() {
		const response = await this.fetchWithAuth("/adr/sessions");
		return response.json();
	}

	async getADRSession(sessionId: string) {
		const response = await this.fetchWithAuth(`/adr/sessions/${sessionId}`);
		return response.json();
	}

	async deleteADRSession(sessionId: string) {
		const response = await this.fetchWithAuth(`/adr/sessions/${sessionId}`, {
			method: "DELETE",
		});
		return response.json();
	}

	async uploadADRSessionGuide(sessionId: string, file: File) {
		const url = `${this.getBaseUrl()}/adr/sessions/${sessionId}/guide`;
		const formData = new FormData();
		formData.append("file", file);
		const response = await fetch(url, { method: "POST", body: formData });
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.json();
	}

	async uploadADRTake(sessionId: string, lineId: string, file: File) {
		const url = `${this.getBaseUrl()}/adr/sessions/${sessionId}/lines/${lineId}/takes`;
		const formData = new FormData();
		formData.append("file", file);
		const response = await fetch(url, { method: "POST", body: formData });
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.json();
	}

	async selectADRTake(sessionId: string, lineId: string, takeId: string) {
		const response = await this.fetchWithAuth(
			`/adr/sessions/${sessionId}/lines/${lineId}/select/${takeId}`,
			{
				method: "POST",
			},
		);
		return response.json();
	}

	async deleteADRTake(takeId: string) {
		const response = await this.fetchWithAuth(`/adr/takes/${takeId}`, {
			method: "DELETE",
		});
		return response.json();
	}

	getADRTakeAudioUrl(takeId: string): string {
		return `${this.getBaseUrl()}/adr/audio/${takeId}`;
	}

	getADRGuideAudioUrl(sessionId: string): string {
		return `${this.getBaseUrl()}/adr/guide-audio/${sessionId}`;
	}

	async getADRTakeWaveform(takeId: string) {
		const response = await this.fetchWithAuth(`/adr/waveform/${takeId}`);
		return response.json();
	}

	async getADRGuideWaveform(sessionId: string) {
		const response = await this.fetchWithAuth(
			`/adr/sessions/${sessionId}/guide-waveform`,
		);
		return response.json();
	}

	async alignADRTake(
		guideAudio: number[],
		takeAudio: number[],
		sampleRate: number = 24000,
	) {
		const response = await this.fetchWithAuth("/adr/align", {
			method: "POST",
			body: JSON.stringify({
				guide_audio: guideAudio,
				take_audio: takeAudio,
				sample_rate: sampleRate,
			}),
		});
		return response.json();
	}

	async scoreADRTake(
		lineId: string,
		audio: number[],
		sampleRate: number = 24000,
	) {
		const response = await this.fetchWithAuth("/adr/score", {
			method: "POST",
			body: JSON.stringify({ line_id: lineId, audio, sample_rate: sampleRate }),
		});
		return response.json();
	}

	async autoSelectADRTake(lineId: string) {
		const response = await this.fetchWithAuth("/adr/auto-select", {
			method: "POST",
			body: JSON.stringify({ line_id: lineId }),
		});
		return response.json();
	}

	// --- Batch Queue ---
}
