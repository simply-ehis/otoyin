/**
 * Canonical engine constants — sourced from backend/backends/protocols.py TTS_ENGINES
 * and backend/backends/configs/tts.py model configs.
 *
 * This is the single source of truth for all TTS engine metadata.
 * Update here when the backend adds/removes/rename an engine — not in 10+ component files.
 */

/**
 * All TTS engines with their display names, keyed by engine id.
 * Mirrors `TTS_ENGINES` in `backend/backends/protocols.py`.
 */
export const TTS_ENGINES = {
	kokoro: "Kokoro 82M",
	fish_speech: "Fish Speech S1-mini",
	fish_speech_s2: "Fish Audio S2 Pro (GGUF)",
	zonos: "Zyphra Zonos",
	styletts2: "StyleTTS2",
	chattts: "ChatTTS",
	f5_tts: "F5-TTS",
	pocket_tts: "Pocket-TTS",
	parler_tts: "Parler-TTS Mini",
	moss_tts_nano: "MOSS-TTS-Nano",
	kitten_tts: "KittenTTS (mini)",
	neutts: "NeuTTS-Air",
	neutts_2e: "NeuTTS-2E",
	orpheus: "Orpheus TTS 3B",
	qwen3_tts: "Qwen3-TTS 12Hz 1.7B Base",
	bark_small: "Bark Small (GGUF)",
} as const;

/** Type-safe engine id union. */
export type EngineId = keyof typeof TTS_ENGINES;

/** Return the display label for an engine id. Falls back to the raw id when unknown. */
export function engineLabel(engine: string): string {
	return (TTS_ENGINES as Record<string, string>)[engine] ?? engine;
}

/** Cloud/BYOK engine — lives in backend MUSIC_ENGINES, not TTS_ENGINES. */
export const CLOUD_ENGINE = "cloud" as const;

/** All selectable engines (TTS + cloud). */
export const ALL_ENGINES = Object.freeze([
	...Object.keys(TTS_ENGINES),
	CLOUD_ENGINE,
]) as readonly string[];

// ── Model name mapping (engine → HF repo id for downloads) ──────────────────

/** Map engine id to its HuggingFace model name used for downloading. */
export const MODEL_NAME_MAP: Record<string, (size?: string) => string> = {
	kokoro: () => "kokoro-onnx",
	fish_speech: () => "fish-speech-s1-mini",
	fish_speech_s2: () => "fish-speech-s2-pro",
	zonos: () => "zonos-v0.1",
	qwen3_tts: () => "qwen3-tts-1.7b",
	bark_small: () => "bark-small",
	styletts2: () => "styletts2",
	chattts: () => "chattts",
	f5_tts: () => "f5-tts",
	pocket_tts: () => "pocket-tts",
	parler_tts: () => "parler-tts-mini",
	moss_tts_nano: () => "moss-tts-nano",
	kitten_tts: () => "kitten-tts-mini",
	neutts: () => "neutts-air",
	neutts_2e: (size) => `neutts-2e-${size ?? "q4"}`,
	orpheus: (size) => `orpheus-${size ?? "q4-k-m"}`,
	cloud: () => "cloud",
};

// ── Capability sets ─────────────────────────────────────────────────────────

/** Engines that only support English and force language=en on select. */
export const ENGLISH_ONLY_ENGINES = new Set([
	"styletts2",
	"parler_tts",
	"neutts_2e",
	"orpheus",
]);

/** Engines that support cloned (reference audio) profiles. */
export const CLONING_ENGINES = new Set([
	"fish_speech",
	"fish_speech_s2",
	"zonos",
	"qwen3_tts",
	"styletts2",
	"f5_tts",
	"pocket_tts",
	"moss_tts_nano",
	"neutts",
	"neutts_2e",
]);

/** Engines that expose built-in preset/designed voices (no reference audio needed). */
export const PRESET_ONLY_ENGINES = new Set(["kokoro", "parler_tts"]);

// ── UI option lists (derived from TTS_ENGINES — never hardcoded separately) ───

/** Engines shown in the profile-form engine selector (preset voices only). */
export const DEFAULT_ENGINE_OPTIONS = Object.entries(TTS_ENGINES).map(
	([value, label]) => ({ value, label }),
) as Array<{
	value: string;
	label: string;
}>;

/** Engines offered in the dubbing TTS-engine picker (subset of TTS_ENGINES). */
export const DUB_ENGINES = [
	"kokoro",
	"fish_speech",
	"fish_speech_s2",
	"zonos",
	"qwen3_tts",
	"bark_small",
	"styletts2",
	"chattts",
	"f5_tts",
	"pocket_tts",
	"parler_tts",
	"moss_tts_nano",
	"kitten_tts",
	"neutts",
	"neutts_2e",
	"orpheus",
] as const;

/** Fallback engines shown in the sample column when the model-status cache is unavailable. */
export const PRESET_ENGINE_FALLBACK = [
	{ value: "kokoro", label: "Kokoro 82M" },
	{ value: "kitten_tts", label: "KittenTTS (mini)" },
] as const;

/** Label lookup for preset engines (used when model status is unavailable). */
export const PRESET_ENGINE_LABELS: Record<string, string> = Object.fromEntries(
	Object.entries(TTS_ENGINES),
);

/** All engines that use preset voices (same as PRESET_ONLY_ENGINES). */
export const PRESET_ENGINES = PRESET_ONLY_ENGINES;

/** Display names for preset engine badges (overrides TTS_ENGINES labels where needed). */
export const ENGINE_DISPLAY_NAMES: Record<string, string> = {
	kokoro: "Kokoro",
	parler_tts: "Parler-TTS",
};
