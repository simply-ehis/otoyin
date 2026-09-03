/** Centralized audio/music-themed error messages for the frontend.

  Every user-facing toast title and description should reference
  constants from this module. This keeps the tone consistent and
  makes copy changes a one-file edit.

  Pattern: toast({ title: ERR_TITLE, description: ERR_DESC })
 */

// ── Toast Titles (short, punchy) ─────────────────────────────────
export const ERR_TITLE_RECORDING = "Recording hiccup";
export const ERR_TITLE_PLAYBACK = "Playback dropout";
export const ERR_TITLE_GENERATION = "Generation stumbled";
export const ERR_TITLE_IMPORT = "Import off-key";
export const ERR_TITLE_EXPORT = "Export didn't land";
export const ERR_TITLE_VOICE_CONVERSION = "Voice conversion snag";
export const ERR_TITLE_TRANSCRIPTION = "Transcription couldn't decode";
export const ERR_TITLE_EFFECTS = "Effects chain broke";
export const ERR_TITLE_UPLOAD = "Upload flatlined";
export const ERR_TITLE_DOWNLOAD = "Download went silent";
export const ERR_TITLE_SAVE = "Save didn't stick";
export const ERR_TITLE_DELETE = "Delete failed";
export const ERR_TITLE_CLONE = "Voice clone failed";
export const ERR_TITLE_PERFORMANCE = "Engine stalled";
export const ERR_TITLE_NETWORK = "Signal lost";
export const ERR_TITLE_MIC = "Microphone muted";
export const ERR_TITLE_PERMISSION = "Access denied";
export const ERR_TITLE_VALIDATION = "Submission off-tempo";
export const ERR_TITLE_NOT_FOUND = "Track not on file";
export const ERR_TITLE_TOO_LARGE = "File too heavy";
export const ERR_TITLE_FORMAT = "Format not supported";
export const ERR_TITLE_EMPTY = "Nothing to play";
export const ERR_TITLE_CLIPBOARD = "Clipboard empty";
export const ERR_TITLE_PROJECT = "Project hiccup";
export const ERR_TITLE_SETTINGS = "Settings didn't save";
export const ERR_TITLE_ADR = "ADR session issue";
export const ERR_TITLE_BATCH = "Batch job issue";
export const ERR_TITLE_STORY = "Story edit issue";
export const ERR_TITLE_CAPTURE = "Capture issue";
export const ERR_TITLE_MODEL = "Model issue";
export const ERR_TITLE_SFX = "Sound effect issue";
export const ERR_TITLE_MUSIC = "Music generation issue";
export const ERR_TITLE_ENHANCE = "Enhancement issue";
export const ERR_TITLE_MIX = "Mix issue";

// ── Toast Descriptions (contextual, helpful) ──────────────────────
export const ERR_DESC_RECORDING_FAILED =
	"Couldn't capture audio — check your mic connection and try again";
export const ERR_DESC_PLAYBACK_FAILED =
	"Audio playback dropped out — the file may be corrupted";
export const ERR_DESC_GENERATION_FAILED =
	"The generation engine hit a rough patch — retry or try a different voice";
export const ERR_DESC_IMPORT_FAILED =
	"Couldn't read that file — check the format and try again";
export const ERR_DESC_EXPORT_FAILED =
	"The export didn't land — try again or pick a different format";
export const ERR_DESC_VOICE_CONVERSION_FAILED =
	"Voice conversion stumbled — check your source audio and try again";
export const ERR_DESC_TRANSCRIPTION_FAILED =
	"Transcription couldn't decode the audio — try a clearer recording";
export const ERR_DESC_EFFECTS_FAILED =
	"The effects chain broke — try simplifying or removing the last effect";
export const ERR_DESC_UPLOAD_FAILED =
	"Upload flatlined — check your connection and try again";
export const ERR_DESC_DOWNLOAD_FAILED =
	"Download went silent — check your connection";
export const ERR_DESC_SAVE_FAILED = "Settings didn't stick — try again";
export const ERR_DESC_DELETE_FAILED =
	"Couldn't delete — it may have already been removed";
export const ERR_DESC_CLONE_FAILED =
	"Voice cloning couldn't imprint — try a longer, clearer reference sample";
export const ERR_DESC_ENGINE_STALLED =
	"The engine stalled — try reducing quality or restarting";
export const ERR_DESC_SIGNAL_LOST =
	"Connection to the studio dropped — reconnecting";
export const ERR_DESC_MIC_DENIED =
	"Microphone access denied — enable it in your system settings";
export const ERR_DESC_NO_MIC =
	"No microphone detected — plug one in and try again";
export const ERR_DESC_NO_AUDIO_DEVICE =
	"No audio output device found — check your speakers";
export const ERR_DESC_VALIDATION =
	"That submission doesn't quite fit — check the fields and try again";
export const ERR_DESC_NOT_FOUND =
	"That item isn't in the studio — it may have been removed";
export const ERR_DESC_TOO_LARGE =
	"That file exceeds the size limit — trim it down";
export const ERR_DESC_FORMAT_UNSUPPORTED =
	"That audio format isn't recognized — try WAV or MP3";
export const ERR_DESC_EMPTY = "Nothing to play — add some audio first";
export const ERR_DESC_CLIPBOARD_EMPTY =
	"The clipboard is empty — copy something first";
export const ERR_DESC_PROJECT_FAILED = "Project operation failed — try again";
export const ERR_DESC_SETTINGS_FAILED = "Settings didn't save — try again";
export const ERR_DESC_ADR_FAILED = "ADR session operation failed — try again";
export const ERR_DESC_BATCH_FAILED = "Batch job failed — check the queue";
export const ERR_DESC_STORY_FAILED = "Story edit failed — try again";
export const ERR_DESC_CAPTURE_FAILED = "Capture operation failed — try again";
export const ERR_DESC_MODEL_FAILED =
	"Model operation failed — check the Models tab";
export const ERR_DESC_SFX_FAILED =
	"Sound effect generation failed — try a different prompt";
export const ERR_DESC_MUSIC_FAILED =
	"Music generation failed — try a different prompt or engine";
export const ERR_DESC_ENHANCE_FAILED =
	"Audio enhancement failed — the recording may be too corrupted";
export const ERR_DESC_MIX_FAILED =
	"Mix preview failed — check your track levels";
export const ERR_DESC_NO_PROFILE =
	"No voice profile selected — pick one from the cards above";
export const ERR_DESC_NO_ENGINE =
	"Pick a cached engine first — no auto-download, no default forcing";
export const ERR_DESC_RENDER_QUEUED = "Check Workspace → Batch for progress";
