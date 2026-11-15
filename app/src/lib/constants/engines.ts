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
	fish_speech_s2: "Fish Audio S2 Pro",
	styletts2: "StyleTTS2",
	pocket_tts: "Pocket TTS",
	parler_tts_gguf: "Parler-TTS Mini",
	moss_tts_nano: "MOSS TTS Nano",
	kitten_tts: "Kitten TTS",
	neutts: "NeuTTS-Air",
	neutts_2e: "NeuTTS-2E",
	orpheus: "Orpheus TTS 3B",
	qwen3_tts: "Qwen3 TTS",
	voxcpm2: "VoxCPM2",
	bark_small: "Bark Small",
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
	fish_speech_s2: () => "fish-speech-s2-pro",
	qwen3_tts: () => "qwen3-tts-1.7b",
	voxcpm2: () => "voxcpm2-q8",
	bark_small: () => "bark-small",
	styletts2: () => "styletts2",
	pocket_tts: () => "pocket-tts",
	parler_tts_gguf: () => "parler-tts-mini",
	moss_tts_nano: () => "moss-tts-nano",
	kitten_tts: () => "kitten-tts-mini",
	neutts: () => "neutts-air",
	neutts_2e: () => "neutts-2e-orig",
	orpheus: (size) => `orpheus-${size ?? "q4-k-m"}`,
	cloud: () => "cloud",
};

// ── Capability sets ─────────────────────────────────────────────────────────

/** Engines that only support English and force language=en on select. */
export const ENGLISH_ONLY_ENGINES = new Set([
	"styletts2",
	"parler_tts_gguf",
	"neutts_2e",
	"orpheus",
]);

/** Engines that support cloned (reference audio) profiles. */
export const CLONING_ENGINES = new Set([
	"fish_speech_s2",
	"qwen3_tts",
	"styletts2",
	"pocket_tts",
	"moss_tts_nano",
	"neutts",
	"voxcpm2",
]);

/** Engines that expose built-in preset/designed voices (no reference audio needed). */
export const PRESET_ONLY_ENGINES = new Set([
	"kokoro",
	"parler_tts_gguf",
	"kitten_tts",
	"neutts_2e",
]);

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
	"fish_speech_s2",
	"qwen3_tts",
	"bark_small",
	"styletts2",
	"pocket_tts",
	"parler_tts_gguf",
	"moss_tts_nano",
	"kitten_tts",
	"neutts",
	"neutts_2e",
	"orpheus",
	"voxcpm2",
] as const;

/** Fallback engines shown in the sample column when the model-status cache is unavailable. */
export const PRESET_ENGINE_FALLBACK = [
	{ value: "kokoro", label: "Kokoro 82M" },
	{ value: "kitten_tts", label: "Kitten TTS" },
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
