/**
 * Centralized audio format constants — single source of truth for accepted formats,
 * size limits, and recording settings.
 *
 * Mirrors backend config.py limits and backend/routes/audio_pipeline/dsp.py allowed extensions.
 */

// ── MIME types ────────────────────────────────────────────────────────────────

/** All accepted audio MIME types (matches backend config). */
export const ACCEPTED_AUDIO_MIME_TYPES = [
	"audio/wav",
	"audio/wave",
	"audio/x-wav",
	"audio/mpeg",
	"audio/mp3",
	"audio/x-m4a",
	"audio/mp4",
	"audio/ogg",
	"audio/flac",
	"audio/aac",
	"audio/webm",
	"audio/opus",
	"audio/ogg;codecs=opus",
	"audio/webm;codecs=opus",
] as const;

/** File extensions corresponding to accepted MIME types. */
export const ACCEPTED_AUDIO_EXTENSIONS = [
	".wav",
	".mp3",
	".m4a",
	".ogg",
	".flac",
	".aac",
	".webm",
	".opus",
] as const;

/** Human-readable format list for UI messages. */
export const ACCEPTED_AUDIO_FORMATS_LABEL =
	"WAV, MP3, M4A, OGG, FLAC, AAC, WebM, Opus";

// ── Size limits (bytes) — mirrors backend config.py ──────────────────────────

/** Maximum file size for profile imports (ZIP). 100 MB default. */
export const PROFILE_MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Maximum file size for individual audio sample uploads. 50 MB default. */
export const PROFILE_SAMPLE_MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum file size for general audio imports. 200 MB default. */
export const IMPORT_AUDIO_MAX_FILE_SIZE = 200 * 1024 * 1024;

/** Maximum file size for images (avatars). 5 MB default. */
export const IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;

// ── Recording settings ────────────────────────────────────────────────────────

/** Maximum duration for voice profile reference samples (seconds). */
export const MAX_AUDIO_DURATION_SECONDS = 30;

/** Preferred MIME type for recording (WebM/Opus is most widely supported). */
export const RECORDING_MIME_TYPE = "audio/webm;codecs=opus";

/** Fallback MIME type if preferred is not supported. */
export const RECORDING_MIME_TYPE_FALLBACK = "audio/webm";

/** Alternative high-quality MIME type (WAV) for direct recording when supported. */
export const RECORDING_MIME_TYPE_WAV = "audio/wav";

/** WebKit (pre-18.4 Safari, old WKWebView) records MP4/AAC only — without
 * these the chain falls through to a mislabeled default. Order matters:
 * Opus first where supported, MP4 where it is the only option. */
export const RECORDING_MIME_TYPE_MP4 = "audio/mp4;codecs=mp4a.40.2";
export const RECORDING_MIME_TYPE_MP4_PLAIN = "audio/mp4";

/** Recording timeslice (ms) — 0 = single blob on stop (avoids WebKit header bug). */
export const RECORDING_TIMESLICE_MS = 0;

// ── Validation helpers ────────────────────────────────────────────────────────

/** Check if a MIME type is in the accepted list. */
export function isAcceptedAudioMimeType(mimeType: string): boolean {
	return ACCEPTED_AUDIO_MIME_TYPES.some((t) =>
		mimeType.startsWith(t.split(";")[0]),
	);
}

/** Check if a file extension is accepted. */
export function isAcceptedAudioExtension(filename: string): boolean {
	const ext = filename.toLowerCase().split(".").pop();
	return ext
		? ACCEPTED_AUDIO_EXTENSIONS.includes(
				`.${ext}` as (typeof ACCEPTED_AUDIO_EXTENSIONS)[number],
			)
		: false;
}

/** Get the max file size for a given upload context. */
export function getMaxFileSizeForContext(
	context: "profile" | "sample" | "import" | "image",
): number {
	switch (context) {
		case "profile":
			return PROFILE_MAX_FILE_SIZE;
		case "sample":
			return PROFILE_SAMPLE_MAX_FILE_SIZE;
		case "import":
			return IMPORT_AUDIO_MAX_FILE_SIZE;
		case "image":
			return IMAGE_MAX_FILE_SIZE;
		default:
			return IMPORT_AUDIO_MAX_FILE_SIZE;
	}
}

/** Format bytes as human-readable string. */
export function formatFileSize(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	let size = bytes;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
