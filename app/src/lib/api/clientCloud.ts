import { ClientInstrumentPackMethods } from "./clientInstrumentPacks";
import type { CloudLlmResponse } from "./types";

export interface CloudLlmMessage {
	role: string;
	content: string;
}

export class ClientCloudMethods extends ClientInstrumentPackMethods {
	async cloudLlm(
		messages: CloudLlmMessage[],
		opts?: { model?: string; temperature?: number; maxTokens?: number },
		subscriptionKey?: string,
	): Promise<CloudLlmResponse> {
		return this.request<CloudLlmResponse>("/cloud/llm", {
			method: "POST",
			body: JSON.stringify({
				messages,
				model: opts?.model,
				temperature: opts?.temperature ?? 0.7,
				max_tokens: opts?.maxTokens ?? 1024,
			}),
			headers: subscriptionKey
				? { "X-Subscription-Key": subscriptionKey }
				: undefined,
		});
	}

	async cloudTts(
		text: string,
		opts?: { voice?: string; format?: string },
		subscriptionKey?: string,
	): Promise<Blob> {
		const res = await this.fetchWithAuth("/cloud/tts", {
			method: "POST",
			body: JSON.stringify({
				text,
				voice: opts?.voice,
				format: opts?.format ?? "wav",
			}),
			headers: subscriptionKey
				? { "X-Subscription-Key": subscriptionKey }
				: undefined,
		});
		return res.blob();
	}

	async cloudDonate(
		amount: number,
		email?: string,
	): Promise<{ checkout_url?: string; order_ref?: string }> {
		return this.request<{ checkout_url?: string; order_ref?: string }>(
			"/cloud/donate",
			{
				method: "POST",
				body: JSON.stringify({ amount, email }),
			},
		);
	}

	async cloudStatus(subscriptionKey?: string): Promise<{
		router_configured: boolean;
		tiers: string[];
		subscription_ok: boolean;
	}> {
		return this.request("/cloud/status", {
			headers: subscriptionKey
				? { "X-Subscription-Key": subscriptionKey }
				: undefined,
		});
	}
}