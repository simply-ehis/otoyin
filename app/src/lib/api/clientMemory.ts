import { SpatialMethods } from "./clientSpatial";

export interface Conversation {
	id: string;
	agent_type: string;
	title: string | null;
	model_id: string | null;
	provider_id: string | null;
	message_count: number;
	is_favorited: boolean;
	created_at: string | null;
	updated_at: string | null;
}

export interface Message {
	id?: string;
	role: string;
	content: string;
	tool_name?: string;
	tool_args?: Record<string, unknown>;
	tool_result?: string;
}

export interface MemoryFact {
	id?: string;
	category: string;
	key: string;
	value: string;
	confidence?: number;
}

export class MemoryMethods extends SpatialMethods {
	async listConversations(
		agentType?: string,
		limit = 50,
		offset = 0,
	): Promise<Conversation[]> {
		const params = new URLSearchParams();
		if (agentType) {
			params.set("agent_type", agentType);
		}
		params.set("limit", String(limit));
		params.set("offset", String(offset));
		return this.request(`/memory/conversations?${params}`);
	}

	async createConversation(data: {
		agent_type?: string;
		title?: string;
		model_id?: string;
		provider_id?: string;
		system_prompt?: string;
	}): Promise<{ id: string; agent_type: string }> {
		return this.request("/memory/conversations", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async getConversation(
		conversationId: string,
	): Promise<Conversation & { messages: Message[] }> {
		return this.request(`/memory/conversations/${conversationId}`);
	}

	async deleteConversation(conversationId: string): Promise<void> {
		await this.request(`/memory/conversations/${conversationId}`, {
			method: "DELETE",
		});
	}

	async addMessage(
		conversationId: string,
		role: string,
		content: string,
		extra?: {
			tool_name?: string;
			tool_args?: Record<string, unknown>;
			tool_result?: string;
		},
	): Promise<{ id: string; role: string }> {
		return this.request(`/memory/conversations/${conversationId}/messages`, {
			method: "POST",
			body: JSON.stringify({ role, content, ...extra }),
		});
	}

	async getHistory(conversationId: string, limit = 100): Promise<Message[]> {
		return this.request(
			`/memory/conversations/${conversationId}/history?limit=${limit}`,
		);
	}

	async updateMessage(messageId: string, content: string): Promise<void> {
		await this.request(`/memory/messages/${messageId}`, {
			method: "PATCH",
			body: JSON.stringify({ content }),
		});
	}

	async deleteMessage(messageId: string): Promise<void> {
		await this.request(`/memory/messages/${messageId}`, {
			method: "DELETE",
		});
	}

	async deleteMessagesAfter(
		conversationId: string,
		messageId: string,
	): Promise<void> {
		await this.request(
			`/memory/conversations/${conversationId}/messages/after/${messageId}`,
			{ method: "DELETE" },
		);
	}

	async recallMemory(
		agentType = "assistant",
		category?: string,
		query?: string,
		limit = 20,
	): Promise<MemoryFact[]> {
		const params = new URLSearchParams({ agent_type: agentType });
		if (category) {
			params.set("category", category);
		}
		if (query) {
			params.set("query", query);
		}
		params.set("limit", String(limit));
		return this.request(`/memory/recall?${params}`);
	}

	async storeMemory(data: {
		agent_type?: string;
		category: string;
		key: string;
		value: string;
		confidence?: number;
	}): Promise<{ id: string; key: string }> {
		return this.request("/memory/store", {
			method: "POST",
			body: JSON.stringify({ agent_type: "assistant", ...data }),
		});
	}

	async forgetMemory(memoryId: string): Promise<void> {
		await this.request(`/memory/forget/${memoryId}`, { method: "DELETE" });
	}

	async getMemoryContext(agentType: string): Promise<{ context: string }> {
		return this.request(`/memory/context/${agentType}`);
	}

	async getRecentHistory(agentType: string, limit = 20): Promise<Message[]> {
		return this.request(`/memory/recent-history/${agentType}?limit=${limit}`);
	}

	async getVoiceChatSettings(): Promise<Record<string, unknown>> {
		return this.request("/memory/voice-chat-settings");
	}

	async saveVoiceChatSettings(
		settings: Record<string, unknown>,
	): Promise<void> {
		await this.request("/memory/voice-chat-settings", {
			method: "POST",
			body: JSON.stringify(settings),
		});
	}

	// Voice-changer control
	async spawnVoiceChanger(): Promise<{
		status: string;
		pid?: number;
		port?: number;
	}> {
		return this.request("/settings/voice-changer/spawn", { method: "POST" });
	}

	async killVoiceChanger(): Promise<{ status: string }> {
		return this.request("/settings/voice-changer/kill", { method: "POST" });
	}

	async getVoiceChangerStatus(): Promise<{ running: boolean; pid?: number }> {
		return this.request("/settings/voice-changer/status");
	}
}
