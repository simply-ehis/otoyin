import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { useAudioStudioStore } from "@/features/audioStudio/AudioStudioStore";
import { apiClient } from "@/lib/api/client";
import {
	type CommandFunctionSchema,
	commandRegistry,
} from "@/lib/commandRegistry";
import { logger } from "@/lib/utils/debug";
import { useUIStore } from "@/stores/uiStore";
import { useVoiceChangerStore } from "@/stores/voiceChangerStore";

export interface AssistantCommandDetail {
	intent: string;
	args: Record<string, unknown>;
}

const ROUTES = {
	home: "/",
	voices: "/voices",
	workspace: "/workspace",
	adr: "/adr",
	studio: "/studio",
	audioStudio: "/audio-studio",
	effects: "/effects",
	models: "/models",
	captures: "/captures",
	stories: "/stories",
} as const;

type ViewKey = keyof typeof ROUTES;

const OK_SCHEMA = z.object({ ok: z.boolean() });

/** Set by useAssistantCommands() so command handlers can navigate. */
let navigateFn:
	| ((opts: { to: string; search?: Record<string, unknown> }) => void)
	| null = null;

/** Called by useAssistantCommands to wire navigation into command handlers. */
export function setNavigate(
	fn: (opts: { to: string; search?: Record<string, unknown> }) => void,
): void {
	navigateFn = fn;
}

function goTo(view: string, session?: string): void {
	if (view === "adr" && session) {
		navigateFn?.({ to: "/adr", search: { session } });
	} else if (view in ROUTES) {
		navigateFn?.({ to: ROUTES[view as ViewKey] });
	}
}

/**
 * Register every client command the in-app agent can execute directly
 * (design doc §9: "direct, not MCP"). These are the lower-risk store
 * setters + navigation — the live audio graph stays driven by the UI.
 */
function registerClientCommands(): void {
	commandRegistry.register({
		name: "ui_navigate",
		description: "Navigate to a named view in the app.",
		category: "navigation",
		inputSchema: z.object({
			view: z.string(),
			session: z.string().optional(),
		}),
		outputSchema: OK_SCHEMA,
		permissions: ["navigate"],
		handler: async ({ view, session }) => {
			goTo(view, session);
			return { ok: true };
		},
	});

	commandRegistry.register({
		name: "ui_set_voice_profile",
		description: "Select the active voice profile.",
		category: "profile",
		inputSchema: z.object({ profile_id: z.string().optional() }),
		outputSchema: OK_SCHEMA,
		permissions: ["voice_profile.write"],
		handler: async ({ profile_id }) => {
			useUIStore.getState().setSelectedProfileId(profile_id ?? null);
			return { ok: true };
		},
	});

	commandRegistry.register({
		name: "studio_add_track",
		description: "Add a track to the Audio Studio session.",
		category: "studio",
		inputSchema: z.object({ name: z.string().optional() }),
		outputSchema: OK_SCHEMA,
		permissions: ["studio.track.write"],
		handler: async ({ name }) => {
			useAudioStudioStore.getState().addTrack(name ? String(name) : undefined);
			return { ok: true };
		},
	});

	commandRegistry.register({
		name: "studio_set_master_volume",
		description: "Set the Audio Studio master volume.",
		category: "studio",
		inputSchema: z.object({ volume: z.number() }),
		outputSchema: OK_SCHEMA,
		permissions: ["studio.volume.write"],
		handler: async ({ volume }) => {
			const v = Number(volume);
			if (!Number.isNaN(v)) {
				useAudioStudioStore.getState().setMasterVolume(v);
			}
			return { ok: true };
		},
	});

	commandRegistry.register({
		name: "studio_import_session",
		description: "Import an Audio Studio session and switch to the studio.",
		category: "studio",
		inputSchema: z.object({ session_id: z.string() }),
		outputSchema: OK_SCHEMA,
		permissions: ["studio.session.write"],
		handler: async ({ session_id }) => {
			if (!session_id) {
				return { ok: false };
			}
			try {
				const session = await apiClient.getAudioStudioSession(session_id);
				useAudioStudioStore.getState().importSession(session.data);
				goTo("audioStudio");
				return { ok: true };
			} catch (e: unknown) {
				logger.debug("[assistant] studio_import_session failed", e);
				return { ok: false };
			}
		},
	});

	commandRegistry.register({
		name: "voice_changer_enable",
		description: "Enable or disable the voice changer.",
		category: "voice_changer",
		inputSchema: z.object({ enabled: z.boolean() }),
		outputSchema: OK_SCHEMA,
		permissions: ["voice_changer.enable"],
		handler: async ({ enabled }) => {
			useVoiceChangerStore.getState().setEnabled(enabled);
			return { ok: true };
		},
	});

	commandRegistry.register({
		name: "voice_changer_set_profile",
		description: "Set the voice changer profile.",
		category: "voice_changer",
		inputSchema: z.object({ profile: z.string().optional() }),
		outputSchema: OK_SCHEMA,
		permissions: ["voice_changer.profile.write"],
		handler: async ({ profile }) => {
			useVoiceChangerStore.getState().setProfile(profile ?? null);
			return { ok: true };
		},
	});

	commandRegistry.register({
		name: "voice_changer_set_preset",
		description: "Apply a voice changer preset (telephone, deep, chipmunk).",
		category: "voice_changer",
		inputSchema: z.object({ preset: z.string().optional() }),
		outputSchema: OK_SCHEMA,
		permissions: ["voice_changer.preset.write"],
		handler: async ({ preset }) => {
			if (!preset) {
				return { ok: false };
			}
			useVoiceChangerStore.getState().setPreset(preset);
			if (preset === "telephone") {
				useVoiceChangerStore.getState().setPitchShift(0);
				useVoiceChangerStore.getState().setFormantShift(0);
			} else if (preset === "deep") {
				useVoiceChangerStore.getState().setPitchShift(-4);
				useVoiceChangerStore.getState().setFormantShift(-2);
			} else if (preset === "chipmunk") {
				useVoiceChangerStore.getState().setPitchShift(6);
				useVoiceChangerStore.getState().setFormantShift(3);
			}
			// Applying a preset turns the changer on so the user hears it immediately.
			useVoiceChangerStore.getState().setEnabled(true);
			return { ok: true };
		},
	});
}

registerClientCommands();

export interface CommandExecutionResult {
	ok: boolean;
	error?: string;
}

/**
 * Execute a registered command by name with validated arguments.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 */
export async function executeAssistantCommand(
	name: string,
	args: Record<string, unknown>,
): Promise<CommandExecutionResult> {
	try {
		await commandRegistry.execute(name, args);
		return { ok: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.debug("[assistant] command failed", { name, args, error: message });
		return { ok: false, error: message };
	}
}

/** All available commands as OpenAI-compatible function schemas for agent tool calling. */
export function getAvailableCommands(): CommandFunctionSchema[] {
	return commandRegistry.getFunctionSchemas();
}

/** Metadata for every registered command (UI discovery). */
export function getCommandMetadata() {
	return commandRegistry.getMetadata();
}

/**
 * Mount once (RootLayout). Handles `assistant-command` DOM events emitted by
 * the chat stream for lower-risk client commands: navigation, Audio Studio,
 * and store setters.
 */
export function useAssistantCommands(): void {
	const navigate = useNavigate();

	useEffect(() => {
		setNavigate((opts) => navigate(opts));

		function handleCommand(event: Event) {
			const detail = (event as CustomEvent<AssistantCommandDetail>).detail;
			if (!detail) {
				return;
			}
			const { intent, args } = detail;
			void executeAssistantCommand(intent, args);
		}

		window.addEventListener("assistant-command", handleCommand);
		return () => window.removeEventListener("assistant-command", handleCommand);
	}, [navigate]);
}

/**
 * Dispatch an `assistant-command` DOM event. Kept for backward compatibility;
 * the event is handled by `useAssistantCommands` and routed through the
 * command registry.
 */
export function dispatchAssistantCommand(
	intent: string,
	args: Record<string, unknown>,
): void {
	window.dispatchEvent(
		new CustomEvent<AssistantCommandDetail>("assistant-command", {
			detail: { intent, args },
		}),
	);
}
