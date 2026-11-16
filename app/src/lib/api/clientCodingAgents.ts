import { ClientCloudMethods } from "./clientCloud";

export interface CodingAgentInfo {
	id: string;
	title: string;
	version: string | null;
	description: string | null;
	website: string | null;
	source: "registry" | "custom";
	distribution: "npx" | "uvx" | "binary" | "custom" | "unknown";
	installed: boolean;
	acp_available: boolean;
	acp_command: string[] | null;
	acp_kind: "native" | "adapter" | "custom";
	install_hint: string;
}

export interface CodingSession {
	id: string;
	agent_id: string;
	title: string;
	status: "idle" | "running" | "done" | "error" | "cancelled";
	cwd: string;
	created_at: string | null;
	updated_at: string | null;
	message_count: number;
	live: boolean;
}

export interface CodingSessionMessage {
	id: string;
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	created_at: string | null;
}

export interface CodingSessionDetail extends CodingSession {
	messages: CodingSessionMessage[];
}

/** REST surface for ACP coding-agent sessions. Streaming prompts use raw
 * fetch in the page because SSE is not a request/response shape. */
export class ClientCodingAgentsMethods extends ClientCloudMethods {
	async listCodingAgents(): Promise<{ agents: CodingAgentInfo[] }> {
		return this.request("/coding-agents");
	}

	async listCodingSessions(): Promise<{ sessions: CodingSession[] }> {
		return this.request("/coding-agents/sessions");
	}

	async refreshAgentRegistry(): Promise<{ agents: number }> {
		return this.request("/coding-agents/registry/refresh", { method: "POST" });
	}

	async listCustomCodingAgents(): Promise<{ agents: CodingAgentInfo[] }> {
		return this.request("/coding-agents/custom");
	}

	async addCustomCodingAgent(name: string, command: string[]): Promise<CodingAgentInfo> {
		return this.request("/coding-agents/custom", {
			method: "POST",
			body: JSON.stringify({ name, command }),
		});
	}

	async deleteCustomCodingAgent(id: string): Promise<{ deleted: string }> {
		return this.request(`/coding-agents/custom/${id}`, { method: "DELETE" });
	}

	async createCodingSession(body: {
		agent_id: string;
		title?: string;
		cwd?: string;
		command?: string[];
	}): Promise<CodingSession> {
		return this.request("/coding-agents/sessions", {
			method: "POST",
			body: JSON.stringify(body),
		});
	}

	async getCodingSession(id: string): Promise<CodingSessionDetail> {
		return this.request(`/coding-agents/sessions/${id}`);
	}

	async cancelCodingSession(id: string): Promise<{ status: string }> {
		return this.request(`/coding-agents/sessions/${id}/cancel`, { method: "POST" });
	}

	async deleteCodingSession(id: string): Promise<{ deleted: string }> {
		return this.request(`/coding-agents/sessions/${id}`, { method: "DELETE" });
	}
}
