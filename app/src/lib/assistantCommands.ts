import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAudioStudioStore } from "@/components/AudioStudio/AudioStudioStore";
import { apiClient } from "@/lib/api/client";
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
	adr: "/workspace/adr",
	studio: "/workspace/studio",
	audioStudio: "/audio-studio",
	effects: "/effects",
	models: "/models",
	captures: "/captures",
	stories: "/stories",
} as const;

type ViewKey = keyof typeof ROUTES;

/**
 * Mount once (RootLayout). Handles `assistant-command` DOM events emitted by
 * the chat stream for lower-risk client commands: navigation, Audio Studio,
 * and store setters.
 */
export function useAssistantCommands(): void {
	const navigate = useNavigate();

	useEffect(() => {
		function handleCommand(event: Event) {
			const detail = (event as CustomEvent<AssistantCommandDetail>).detail;
			if (!detail) {
				return;
			}
			const { intent, args } = detail;

			switch (intent) {
				case "ui_navigate": {
					const view = String(args.view ?? "");
					const session = args.session ? String(args.session) : undefined;
					if (view === "adr" && session) {
						navigate({ to: "/workspace/adr", search: { session } });
					} else if (view in ROUTES) {
						navigate({ to: ROUTES[view as ViewKey] });
					}
					break;
				}
				case "ui_set_voice_profile": {
					const id = args.profile_id ? String(args.profile_id) : null;
					useUIStore.getState().setSelectedProfileId(id);
					break;
				}
				case "studio_add_track": {
					useAudioStudioStore
						.getState()
						.addTrack(args.name ? String(args.name) : undefined);
					break;
				}
				case "studio_set_master_volume": {
					const volume = Number(args.volume);
					if (!Number.isNaN(volume)) {
						useAudioStudioStore.getState().setMasterVolume(volume);
					}
					break;
				}
				case "studio_import_session": {
					const id = args.session_id ? String(args.session_id) : "";
					if (!id) {
						break;
					}
					apiClient
						.getAudioStudioSession(id)
						.then((session) => {
							useAudioStudioStore.getState().importSession(session.data);
							navigate({ to: "/audio-studio" });
						})
						.catch((e: unknown) => {
							logger.debug("[assistant] createSession failed", e);
						});
					break;
				}
				case "voice_changer_enable": {
					const enabled = Boolean(args.enabled);
					useVoiceChangerStore.getState().setEnabled(enabled);
					break;
				}
				case "voice_changer_set_profile": {
					const profile = args.profile ? String(args.profile) : null;
					useVoiceChangerStore.getState().setProfile(profile);
					break;
				}
				case "voice_changer_set_preset": {
					const preset = args.preset ? String(args.preset) : null;
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
					// Applying a preset turns the changer on so the user hears it immediately
					// (lower-risk store setter; the live audio graph is driven by the UI, not the agent).
					useVoiceChangerStore.getState().setEnabled(true);
					break;
				}
				default:
					break;
			}
		}

		window.addEventListener("assistant-command", handleCommand);
		return () => window.removeEventListener("assistant-command", handleCommand);
	}, [navigate]);
}

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
