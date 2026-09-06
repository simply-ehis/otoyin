import i18n from "@/i18n";

export function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const absSec = Math.abs(diffMs) / 1000;

	if (absSec < 60) {
		return "just now";
	}
	if (absSec < 3600) {
		return `${Math.floor(absSec / 60)}m ago`;
	}
	if (absSec < 86400) {
		return `${Math.floor(absSec / 3600)}h ago`;
	}
	if (absSec < 2592000) {
		return `${Math.floor(absSec / 86400)}d ago`;
	}
	if (absSec < 31536000) {
		return `${Math.floor(absSec / 2592000)}mo ago`;
	}
	return `${Math.floor(absSec / 31536000)}y ago`;
}

export function formatDate(date: string | Date): string {
	const dateObj = typeof date === "string" ? new Date(date.trim()) : date;
	return getRelativeTime(dateObj);
}

export function formatAbsoluteDate(date: string | Date): string {
	const dateObj = typeof date === "string" ? new Date(date) : date;
	return dateObj.toLocaleString(i18n.language, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

const ENGINE_DISPLAY_NAMES: Record<string, string> = {
	kokoro: "Kokoro",
	zonos: "Zonos",
	qwen3_tts: "Qwen3-TTS",
	bark_small: "Bark Small",
	styletts2: "StyleTTS2",
	pocket_tts: "Pocket-TTS",
	parler_tts: "Parler-TTS",
	moss_tts_nano: "MOSS Nano",
	kitten_tts: "KittenTTS",
	neutts: "NeuTTS",
	neutts_2e: "NeuTTS-2E",
	orpheus: "Orpheus",
};

export function formatEngineName(engine?: string, modelSize?: string): string {
	if (!engine) {
		return "No model";
	}
	const name = ENGINE_DISPLAY_NAMES[engine] ?? engine;
	if (modelSize) {
		return `${name} ${modelSize}`;
	}
	return name;
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) {
		return "0 Bytes";
	}
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}
