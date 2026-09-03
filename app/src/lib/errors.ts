import { toast } from "@/components/ui/use-toast";

export type ErrorSeverity = "critical" | "warning" | "info";

export interface StudioError {
	code: string;
	title: string;
	message: string;
	severity: ErrorSeverity;
	retryable: boolean;
}

const ERROR_MAP: Record<string, StudioError> = {
	// Network / backend
	SIGNAL_LOST: {
		code: "SIGNAL_LOST",
		title: "Signal Lost",
		message:
			"The connection to the audio engine dropped. Check your cables (network) and try again.",
		severity: "critical",
		retryable: true,
	},
	ENGINE_STALLED: {
		code: "ENGINE_STALLED",
		title: "Engine Stalled",
		message:
			"The synthesis engine hit a glitch. Rebooting the session should clear it.",
		severity: "critical",
		retryable: true,
	},
	SAMPLE_BUFFER_UNDERRUN: {
		code: "SAMPLE_BUFFER_UNDERRUN",
		title: "Buffer Underrun",
		message:
			"The audio pipeline ran dry. Try reducing the sample rate or closing other tracks.",
		severity: "warning",
		retryable: true,
	},

	// File / import
	CORRUPTED_TRACK: {
		code: "CORRUPTED_TRACK",
		title: "Corrupted Track",
		message:
			"This file looks like a warped record — the format is damaged or unsupported.",
		severity: "warning",
		retryable: false,
	},
	UNSUPPORTED_FORMAT: {
		code: "UNSUPPORTED_FORMAT",
		title: "Unsupported Format",
		message:
			"This tape won't play on our deck. Try a standard WAV, MP3, or FLAC file.",
		severity: "warning",
		retryable: false,
	},

	// Hardware / permissions
	MICROPHONE_MUTED: {
		code: "MICROPHONE_MUTED",
		title: "Mic Is Muted",
		message:
			"Your microphone is silenced by the system. Check your OS privacy settings.",
		severity: "warning",
		retryable: true,
	},
	NO_AUDIO_DEVICE: {
		code: "NO_AUDIO_DEVICE",
		title: "No Audio Device",
		message:
			"No output device found. Plug in speakers or headphones and try again.",
		severity: "warning",
		retryable: true,
	},

	// Model / inference
	MODEL_NOT_LOADED: {
		code: "MODEL_NOT_LOADED",
		title: "Model Offline",
		message:
			"The voice model isn't loaded yet. Download it from the Models tab and try again.",
		severity: "warning",
		retryable: true,
	},
	INFERENCE_FAILED: {
		code: "INFERENCE_FAILED",
		title: "Generation Glitch",
		message:
			"The neural engine stuttered during generation. Hit retry — sometimes it needs a second take.",
		severity: "warning",
		retryable: true,
	},

	// Session / state
	SESSION_OVERLOAD: {
		code: "SESSION_OVERLOAD",
		title: "Session Overloaded",
		message:
			"Too many tracks for the mixer. Save your work and bounce some tracks to free up headroom.",
		severity: "warning",
		retryable: true,
	},
	AUTOSAVE_FAILED: {
		code: "AUTOSAVE_FAILED",
		title: "Autosave Failed",
		message:
			"Couldn't save your session to disk. Check your storage and try manually saving.",
		severity: "warning",
		retryable: true,
	},

	// Recording / microphone
	NO_MICROPHONE_ACCESS: {
		code: "NO_MICROPHONE_ACCESS",
		title: "No Mic Access",
		message:
			"The mic is blocked by your privacy settings. Check System Preferences → Security & Privacy.",
		severity: "warning",
		retryable: true,
	},
	RECORDING_FAILED: {
		code: "RECORDING_FAILED",
		title: "Recording Failed",
		message:
			"The input chain dropped out mid-take. Check your interface and try recording again.",
		severity: "critical",
		retryable: true,
	},
	SILENCE_DETECTED: {
		code: "SILENCE_DETECTED",
		title: "No Signal",
		message:
			"Input level is in the red — nothing coming through. Check your cables and input gain.",
		severity: "warning",
		retryable: true,
	},

	// Export / import
	EXPORT_FAILED: {
		code: "EXPORT_FAILED",
		title: "Export Failed",
		message:
			"Bounce didn't land. Check your output path and disk space, then try rendering again.",
		severity: "critical",
		retryable: true,
	},
	IMPORT_FAILED: {
		code: "IMPORT_FAILED",
		title: "Import Failed",
		message:
			"That project file didn't parse. Check the version and try a different source.",
		severity: "warning",
		retryable: false,
	},

	// Storage / system
	DISK_SPACE_LOW: {
		code: "DISK_SPACE_LOW",
		title: "Disk Full",
		message:
			"Ran out of room on your drive. Free up some space and the render can finish.",
		severity: "critical",
		retryable: true,
	},
	MEMORY_PRESSURE: {
		code: "MEMORY_PRESSURE",
		title: "Memory Pressure",
		message:
			"Ran out of RAM mid-render. Close other apps or split this into shorter segments.",
		severity: "critical",
		retryable: true,
	},

	// Voice / model operations
	CLONE_FAILED: {
		code: "CLONE_FAILED",
		title: "Clone Failed",
		message:
			"The voice imprint didn't land. Try re-recording the sample with a quieter room.",
		severity: "warning",
		retryable: true,
	},
	STT_FAILED: {
		code: "STT_FAILED",
		title: "Transcription Failed",
		message:
			"The speech-to-text engine dropped the clip. Try again — ambient noise can throw it off.",
		severity: "warning",
		retryable: true,
	},
	VOICE_CONVERSION_FAILED: {
		code: "VOICE_CONVERSION_FAILED",
		title: "Voice Conversion Failed",
		message:
			"The tone-color transfer didn't converge. Check the source clip and reference voice.",
		severity: "warning",
		retryable: true,
	},
	EFFECTS_CHAIN_ERROR: {
		code: "EFFECTS_CHAIN_ERROR",
		title: "Effects Chain Error",
		message:
			"One or more effects couldn't apply. Check the rack order and parameter ranges.",
		severity: "warning",
		retryable: true,
	},
	DOWNLOAD_FAILED: {
		code: "DOWNLOAD_FAILED",
		title: "Download Failed",
		message:
			"Model fetch bounced — network dropped or the cache got interrupted. Resume from Models.",
		severity: "warning",
		retryable: true,
	},
	DUPLICATE_PROFILE: {
		code: "DUPLICATE_PROFILE",
		title: "Name in Use",
		message:
			"A voice profile already has that name. Pick another and we'll slot it in.",
		severity: "info",
		retryable: false,
	},
	LLM_OFFLINE: {
		code: "LLM_OFFLINE",
		title: "Model Not Loaded",
		message:
			"The assistant brain isn't spun up yet. Download it from the Models tab — it loads on first use.",
		severity: "warning",
		retryable: true,
	},
	INVALID_TIMECODE: {
		code: "INVALID_TIMECODE",
		title: "Timecode Error",
		message:
			"That timecode string didn't land on the grid. Check the format (e.g. 01:02.345).",
		severity: "warning",
		retryable: false,
	},

	// Generic
	UNEXPECTED_GLITCH: {
		code: "UNEXPECTED_GLITCH",
		title: "Unexpected Glitch",
		message:
			"Something popped in the signal chain. Here's what the console said:",
		severity: "critical",
		retryable: true,
	},
};

export function getStudioError(code: string): StudioError {
	return ERROR_MAP[code] ?? ERROR_MAP.UNEXPECTED_GLITCH;
}

export function inferStudioError(error: unknown): StudioError {
	const msg = error instanceof Error ? error.message : String(error);

	if (/microphone|mic.*access|permission.*denied.*mic|notallowed/i.test(msg)) {
		return ERROR_MAP.NO_MICROPHONE_ACCESS;
	}
	if (/no.*audio.*device|output.*device|speaker.*not.*found/i.test(msg)) {
		return ERROR_MAP.NO_AUDIO_DEVICE;
	}
	if (/network|fetch|connection|ECONNREFUSED|signal.*lost/i.test(msg)) {
		return ERROR_MAP.SIGNAL_LOST;
	}
	if (/model.*(not|failed|load)|llm.*offline|brain.*not.*loaded/i.test(msg)) {
		return ERROR_MAP.LLM_OFFLINE;
	}
	if (/download.*model|model.*download/i.test(msg)) {
		return ERROR_MAP.DOWNLOAD_FAILED;
	}
	if (/format|unsupported|invalid.*file|decode/i.test(msg)) {
		return ERROR_MAP.UNSUPPORTED_FORMAT;
	}
	if (/clone|voice.*imprint|voice.*profile.*create/i.test(msg)) {
		return ERROR_MAP.CLONE_FAILED;
	}
	if (/transcrib|stt|speech.*text/i.test(msg)) {
		return ERROR_MAP.STT_FAILED;
	}
	if (/voice.*convert|tone.*color/i.test(msg)) {
		return ERROR_MAP.VOICE_CONVERSION_FAILED;
	}
	if (/effect|plugin|chain/i.test(msg)) {
		return ERROR_MAP.EFFECTS_CHAIN_ERROR;
	}
	if (/disk.*full|space|enospc|no.*space.*left/i.test(msg)) {
		return ERROR_MAP.DISK_SPACE_LOW;
	}
	if (/memory|ram|alloc/i.test(msg)) {
		return ERROR_MAP.MEMORY_PRESSURE;
	}
	if (/export|bounce|render/i.test(msg)) {
		return ERROR_MAP.EXPORT_FAILED;
	}
	if (/import.*project|project.*import/i.test(msg)) {
		return ERROR_MAP.IMPORT_FAILED;
	}
	if (/duplicate.*name|name.*already.*exist|conflict/i.test(msg)) {
		return ERROR_MAP.DUPLICATE_PROFILE;
	}
	if (/timecode|invalid.*time/i.test(msg)) {
		return ERROR_MAP.INVALID_TIMECODE;
	}
	if (/mic.*muted|silence|no.*signal|input.*level.*0/i.test(msg)) {
		return ERROR_MAP.SILENCE_DETECTED;
	}
	if (/recording.*fail|record.*fail|input.*chain.*drop/i.test(msg)) {
		return ERROR_MAP.RECORDING_FAILED;
	}
	if (/save|write.*file|autosave/i.test(msg)) {
		return ERROR_MAP.AUTOSAVE_FAILED;
	}
	if (/buffer.*underrun|pipeline.*dry|ran.*dry/i.test(msg)) {
		return ERROR_MAP.SAMPLE_BUFFER_UNDERRUN;
	}
	if (/stutter|glitch|engine.*stall|session.*overload/i.test(msg)) {
		return ERROR_MAP.ENGINE_STALLED;
	}

	return {
		...ERROR_MAP.UNEXPECTED_GLITCH,
		message: `${ERROR_MAP.UNEXPECTED_GLITCH.message} ${msg}`,
	};
}

export function showStudioErrorToast(error: unknown): void {
	const studioErr = inferStudioError(error);
	toast({
		variant: studioErr.severity === "critical" ? "destructive" : "default",
		title: studioErr.title,
		description: studioErr.message,
		duration: studioErr.severity === "critical" ? 8000 : 5000,
	});
}
