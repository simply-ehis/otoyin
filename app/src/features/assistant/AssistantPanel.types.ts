import {
	PhotoIcon as Assets,
	ChatBubbleLeftRightIcon as Chat,
	FolderIcon as Folder,
	ArrowPathIcon as History,
	ListBulletIcon as Plan,
	WrenchIcon as Skills,
} from "@heroicons/react/24/outline";

export interface Msg {
	id: string;
	role:
		| "user"
		| "assistant"
		| "tool_call"
		| "tool_result"
		| "error"
		| "audio_preview"
		| "thinking";
	content: string;
	serverId?: string;
	toolName?: string;
	toolArgs?: Record<string, unknown>;
	toolResult?: string;
	isEditing?: boolean;
	branchPoint?: boolean;
}

export const SUGGESTED = [
	"Open the ADR view for session S1",
	"Generate a cinematic music cue",
	"Transcribe my latest capture",
	"Add a track to Audio Studio",
	"List available models",
	"Set master volume to 0.5",
];

export const TABS = [
	{ id: "chat", label: "Chat", Icon: Chat },
	{ id: "projects", label: "Projects", Icon: Folder },
	{ id: "plan", label: "Plan", Icon: Plan },
	{ id: "assets", label: "Assets", Icon: Assets },
	{ id: "skills", label: "Skills", Icon: Skills },
	{ id: "history", label: "History", Icon: History },
] as const;

export type TabId = (typeof TABS)[number]["id"];

let msgCounter = 0;
export const makeId = () => `msg-${++msgCounter}-${Date.now()}`;

export interface LocalModel {
	id: string;
	name: string;
	size: string;
}

export interface ApiProvider {
	id: string;
	name: string;
	base_url: string;
}

export interface FileAttachment {
	file: File;
	preview?: string;
	uploading?: boolean;
	serverPath?: string;
}
