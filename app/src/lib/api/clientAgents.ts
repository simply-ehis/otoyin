import { HelpMethods } from "./clientHelp";

export interface AgentProject {
	id: string;
	name: string;
	description: string | null;
	source_url: string | null;
	checkout_commit: string | null;
	local_path: string | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface AgentProjectSource {
	id: string;
	project_id: string;
	name: string;
	url: string | null;
	source_type: string;
	local_path: string | null;
	created_at: string | null;
}

export interface AgentPlanStep {
	id: string;
	text: string;
	done: boolean;
}

export interface AgentPlan {
	id: string;
	project_id: string;
	title: string;
	status: string;
	steps: AgentPlanStep[];
	created_at: string;
	updated_at: string;
}

export interface AgentProjectContext {
	project_id: string;
	project_name: string;
	roots: string[];
	include_globs: string[];
	exclude_globs: string[];
}

export interface AcquireResult {
	source: string;
	local_path: string;
	filename: string;
	url: string;
}

/**
 * Vendored agent-workspace endpoints (projects / plans / asset acquisition),
 * mirroring galileo-core's project + acquire concepts without depending on it.
 */
export class AgentMethods extends HelpMethods {
	async listProjects(): Promise<AgentProject[]> {
		return this.request<AgentProject[]>("/projects");
	}

	async createAgentProject(name: string, description?: string): Promise<AgentProject> {
		return this.request<AgentProject>("/projects", {
			method: "POST",
			body: JSON.stringify({ name, description: description ?? null }),
		});
	}

	async getProject(projectId: string): Promise<AgentProject> {
		return this.request<AgentProject>(`/projects/${projectId}`);
	}

	async deleteProject(projectId: string, removeDirs = true): Promise<{ ok: boolean }> {
		return this.request<{ ok: boolean }>(
			`/projects/${projectId}?remove_dirs=${removeDirs}`,
			{ method: "DELETE" },
		);
	}

	async getProjectPaths(projectId: string): Promise<Record<string, string>> {
		return this.request<Record<string, string>>(`/projects/${projectId}/paths`);
	}

	async getProjectContext(projectId: string): Promise<AgentProjectContext> {
		return this.request<AgentProjectContext>(`/projects/${projectId}/context`);
	}

	async listSources(projectId: string): Promise<AgentProjectSource[]> {
		return this.request<AgentProjectSource[]>(`/projects/${projectId}/sources`);
	}

	async addSource(
		projectId: string,
		name: string,
		sourceType: string,
		url?: string,
		localPath?: string,
	): Promise<AgentProjectSource> {
		return this.request<AgentProjectSource>(`/projects/${projectId}/sources`, {
			method: "POST",
			body: JSON.stringify({
				name,
				source_type: sourceType,
				url: url ?? null,
				local_path: localPath ?? null,
			}),
		});
	}

	async removeSource(projectId: string, sourceId: string): Promise<{ ok: boolean }> {
		return this.request<{ ok: boolean }>(
			`/projects/${projectId}/sources/${sourceId}`,
			{ method: "DELETE" },
		);
	}

	async listPlans(projectId: string): Promise<AgentPlan[]> {
		return this.request<AgentPlan[]>(`/projects/${projectId}/plans`);
	}

	async createPlan(
		projectId: string,
		payload: { title: string; steps?: unknown[]; status?: string; plan_id?: string },
	): Promise<AgentPlan> {
		return this.request<AgentPlan>(`/projects/${projectId}/plans`, {
			method: "POST",
			body: JSON.stringify(payload),
		});
	}

	async getPlan(projectId: string, planId: string): Promise<AgentPlan> {
		return this.request<AgentPlan>(`/projects/${projectId}/plans/${planId}`);
	}

	async updatePlanStatus(
		projectId: string,
		planId: string,
		status: string,
	): Promise<AgentPlan> {
		return this.request<AgentPlan>(`/projects/${projectId}/plans/${planId}/status`, {
			method: "PATCH",
			body: JSON.stringify({ status }),
		});
	}

	async deletePlan(projectId: string, planId: string): Promise<{ ok: boolean }> {
		return this.request<{ ok: boolean }>(`/projects/${projectId}/plans/${planId}`, {
			method: "DELETE",
		});
	}

	async acquireSearch(
		source: string,
		query: string,
		limit = 20,
		assetType = "all",
	): Promise<unknown> {
		return this.request("/acquire/search", {
			method: "POST",
			body: JSON.stringify({ source, query, limit, asset_type: assetType }),
		});
	}

	async acquireDownload(payload: {
		source: string;
		url?: string;
		asset_id?: string;
		asset_type?: string;
		filename?: string;
		resolution?: string;
	}): Promise<AcquireResult> {
		return this.request<AcquireResult>("/acquire/download", {
			method: "POST",
			body: JSON.stringify(payload),
		});
	}
}
