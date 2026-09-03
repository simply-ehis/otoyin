import { useServerStore } from "@/stores/serverStore";

const DEFAULT_TIMEOUT = 15_000;

function baseUrl() {
	return useServerStore.getState().serverUrl;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${baseUrl()}${path}`, {
		headers: { "Content-Type": "application/json" },
		...init,
		signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		const detail = (body as { detail?: string }).detail ?? res.statusText;
		throw new Error(detail);
	}
	if (res.status === 204) {
		return undefined as T;
	}
	return res.json() as Promise<T>;
}

export interface CustomSkillData {
	id: string;
	skill_id: string;
	name: string;
	description: string;
	triggers: string[];
	steps: string[];
	tools: Record<string, string[]>;
	pitfalls: string[];
	enabled: boolean;
	created_at: string | null;
	updated_at: string | null;
}

export interface CustomSkillCreate {
	skill_id: string;
	name: string;
	description?: string;
	triggers?: string[];
	steps?: string[];
	tools?: Record<string, string[]>;
	pitfalls?: string[];
}

export interface CustomSkillUpdate {
	name?: string;
	description?: string;
	triggers?: string[];
	steps?: string[];
	tools?: Record<string, string[]>;
	pitfalls?: string[];
	enabled?: boolean;
}

export function listCustomSkills(query?: string): Promise<{ skills: CustomSkillData[] }> {
	const params = query ? `?query=${encodeURIComponent(query)}` : "";
	return request(`/skills${params}`);
}

export function getCustomSkill(skillId: string): Promise<CustomSkillData> {
	return request(`/skills/${encodeURIComponent(skillId)}`);
}

export function createCustomSkill(data: CustomSkillCreate): Promise<CustomSkillData> {
	return request("/skills", {
		method: "POST",
		body: JSON.stringify(data),
	});
}

export function updateCustomSkill(skillId: string, data: CustomSkillUpdate): Promise<CustomSkillData> {
	return request(`/skills/${encodeURIComponent(skillId)}`, {
		method: "PUT",
		body: JSON.stringify(data),
	});
}

export function deleteCustomSkill(skillId: string): Promise<void> {
	return request(`/skills/${encodeURIComponent(skillId)}`, {
		method: "DELETE",
	});
}
