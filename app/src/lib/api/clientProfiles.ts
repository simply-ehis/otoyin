import { formatErrorDetail } from "./clientCore";
import { CrashesMethods } from "./clientCrashes";
import type {
	EffectConfig,
	HealthCheckResponse,
	HealthModelsResponse,
	HealthResponse,
	PersonalityTextResponse,
	PresetVoice,
	ProfileSampleResponse,
	VoiceProfileCreate,
	VoiceProfileResponse,
} from "./types";

export class ProfilesMethods extends CrashesMethods {
	async getHealth(): Promise<HealthResponse> {
		return this.request<HealthResponse>("/health");
	}

	async getHealthModels(): Promise<HealthModelsResponse> {
		return this.request<HealthModelsResponse>("/health/models");
	}

	async getHealthCheck(): Promise<HealthCheckResponse> {
		return this.request<HealthCheckResponse>("/health/check");
	}

	// Profiles

	async createProfile(data: VoiceProfileCreate): Promise<VoiceProfileResponse> {
		return this.request<VoiceProfileResponse>("/profiles", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async listProfiles(): Promise<VoiceProfileResponse[]> {
		return this.request<VoiceProfileResponse[]>("/profiles");
	}

	async getProfile(profileId: string): Promise<VoiceProfileResponse> {
		return this.request<VoiceProfileResponse>(`/profiles/${profileId}`);
	}

	async listPresetVoices(
		engine: string,
	): Promise<{ engine: string; voices: PresetVoice[] }> {
		return this.request<{ engine: string; voices: PresetVoice[] }>(
			`/profiles/presets/${engine}`,
		);
	}

	/**
	 * Synthesize a short snippet for a built-in preset voice. The backend
	 * caches the wav on disk, so repeat auditions are instant. Idempotent —
	 * safe to call per click; callers should still cache the blob URL.
	 */
	async synthesizePresetVoicePreview(
		engine: string,
		voiceId: string,
	): Promise<Blob> {
		const resp = await this.fetchWithAuth("/profiles/preset-voice-preview", {
			method: "POST",
			body: JSON.stringify({ engine, voice_id: voiceId }),
		}, 120_000);
		return resp.blob();
	}

	async getVoiceDesignCapabilities(): Promise<{
		engines: Record<
			string,
			{
				label: string;
				design_mode: string;
				description: string;
				supported_attributes: string[];
				attributes_help: Record<string, string>;
			}
		>;
		default_engine: string;
		composed_prompt_preview: boolean;
		accent_groups?: Record<string, { label: string; accents: string[] }>;
		style_groups?: Record<
			string,
			{ label: string; styles: string[]; help: string }
		>;
		all_models?: {
			model_name: string;
			display_name: string;
			engine: string;
			languages: string[];
			preset_voice_count: number;
			preset_voices: {
				id: string;
				name: string;
				gender?: string | null;
				language?: string | null;
			}[];
			clone_voice: boolean;
			voice_design: boolean;
			supports_voice_mixing: boolean;
			emotion_control: boolean;
			paralinguistic_tags: boolean;
			supports_instruct: boolean;
			supported_tags: string[];
		}[];
	}> {
		return this.request("/profiles/voice-design-capabilities");
	}

	async updateProfile(
		profileId: string,
		data: VoiceProfileCreate,
	): Promise<VoiceProfileResponse> {
		return this.request<VoiceProfileResponse>(`/profiles/${profileId}`, {
			method: "PUT",
			body: JSON.stringify(data),
		});
	}

	async deleteProfile(profileId: string): Promise<void> {
		await this.request<void>(`/profiles/${profileId}`, {
			method: "DELETE",
		});
	}

	// ── Personality-driven text generation ─────────────────────────────
	// Compose produces a fresh in-character utterance the UI drops into
	// the generate textarea. Rewrite now happens server-side inside
	// `/generate` when `personality: true` is passed in the request body.

	async composeWithPersonality(
		profileId: string,
	): Promise<PersonalityTextResponse> {
		return this.request<PersonalityTextResponse>(
			`/profiles/${profileId}/compose`,
			{
				method: "POST",
			},
		);
	}

	async addProfileSample(
		profileId: string,
		file: File,
		referenceText: string,
	): Promise<ProfileSampleResponse> {
		const url = `${this.getBaseUrl()}/profiles/${profileId}/samples`;
		const formData = new FormData();
		formData.append("file", file);
		formData.append("reference_text", referenceText);

		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}

		return response.json();
	}

	async listProfileSamples(
		profileId: string,
	): Promise<ProfileSampleResponse[]> {
		return this.request<ProfileSampleResponse[]>(
			`/profiles/${profileId}/samples`,
		);
	}

	async deleteProfileSample(sampleId: string): Promise<void> {
		await this.request<void>(`/profiles/samples/${sampleId}`, {
			method: "DELETE",
		});
	}

	async updateProfileSample(
		sampleId: string,
		referenceText: string,
	): Promise<ProfileSampleResponse> {
		return this.request<ProfileSampleResponse>(
			`/profiles/samples/${sampleId}`,
			{
				method: "PUT",
				body: JSON.stringify({ reference_text: referenceText }),
			},
		);
	}

	async exportProfile(profileId: string): Promise<Blob> {
		const url = `${this.getBaseUrl()}/profiles/${profileId}/export`;
		const response = await fetch(url);

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}

		return response.blob();
	}

	async importProfile(file: File): Promise<VoiceProfileResponse> {
		const url = `${this.getBaseUrl()}/profiles/import`;
		const formData = new FormData();
		formData.append("file", file);

		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}

		return response.json();
	}

	async uploadAvatar(
		profileId: string,
		file: File,
	): Promise<VoiceProfileResponse> {
		const url = `${this.getBaseUrl()}/profiles/${profileId}/avatar`;
		const formData = new FormData();
		formData.append("file", file);

		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}

		return response.json();
	}

	async deleteAvatar(profileId: string): Promise<void> {
		await this.request<void>(`/profiles/${profileId}/avatar`, {
			method: "DELETE",
		});
	}

	// Generation

	async getProfileChannels(
		profileId: string,
	): Promise<{ channel_ids: string[] }> {
		return this.request(`/profiles/${profileId}/channels`);
	}

	async setProfileChannels(
		profileId: string,
		channelIds: string[],
	): Promise<{ message: string }> {
		return this.request(`/profiles/${profileId}/channels`, {
			method: "PUT",
			body: JSON.stringify({ channel_ids: channelIds }),
		});
	}

	// CUDA Backend Management

	async updateProfileEffects(
		profileId: string,
		effectsChain: EffectConfig[] | null,
	): Promise<VoiceProfileResponse> {
		return this.request<VoiceProfileResponse>(
			`/profiles/${profileId}/effects`,
			{
				method: "PUT",
				body: JSON.stringify({ effects_chain: effectsChain }),
			},
		);
	}
}
