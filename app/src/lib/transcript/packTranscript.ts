/**
 * Packed transcript rendering (video-use contract, local data).
 *
 * Groups Scribe-shaped word entries into phrase lines, breaking on silence
 * >= threshold or speaker change — the same rules as video-use's
 * pack_transcripts.py, so packs are interchangeable in both directions.
 */

export interface PackWord {
	text: string;
	start: number;
	end: number;
	type?: string;
	speaker_id?: string | null;
	score?: number;
}

export interface PackPhrase {
	start: number;
	end: number;
	text: string;
	speaker: string | null;
}

export const SILENCE_THRESHOLD_S = 0.5;

/** "002.52" — fixed 6-char width for column alignment. */
export function formatTime(seconds: number): string {
	return seconds.toFixed(2).padStart(6, "0");
}

/** "43.0s" or "2m 05.5s". */
export function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const rest = (seconds - minutes * 60).toFixed(1).padStart(4, "0");
	return `${minutes}m ${rest}s`;
}

function cleanTokenText(text: string, type: string): string | null {
	const raw = text.trim();
	if (!raw) {
		return null;
	}
	if (type === "audio_event" && !raw.startsWith("(")) {
		return `(${raw})`;
	}
	return raw;
}

export function groupIntoPhrases(
	words: PackWord[],
	silenceThreshold = SILENCE_THRESHOLD_S,
): PackPhrase[] {
	const phrases: PackPhrase[] = [];
	let current: PackWord[] = [];
	let currentStart: number | null = null;
	let currentSpeaker: string | null = null;
	let prevEnd: number | null = null;

	const flush = () => {
		if (current.length === 0) {
			return;
		}
		const parts: string[] = [];
		for (const word of current) {
			const cleaned = cleanTokenText(word.text, word.type ?? "word");
			if (cleaned) {
				parts.push(cleaned);
			}
		}
		if (parts.length > 0) {
			const last = current[current.length - 1];
			const text = parts
				.join(" ")
				.replace(" ,", ",")
				.replace(" .", ".")
				.replace(" ?", "?")
				.replace(" !", "!");
			phrases.push({
				start: currentStart ?? 0,
				end: last.end ?? last.start,
				text,
				speaker: currentSpeaker,
			});
		}
		current = [];
		currentStart = null;
		currentSpeaker = null;
	};

	for (const word of words) {
		const type = word.type ?? "word";
		if (type === "spacing") {
			if (word.end - word.start >= silenceThreshold) {
				flush();
			}
			continue;
		}
		const speaker = word.speaker_id ?? null;
		if (
			currentSpeaker !== null &&
			speaker !== null &&
			speaker !== currentSpeaker
		) {
			flush();
		}
		if (prevEnd !== null && word.start - prevEnd >= silenceThreshold) {
			flush();
		}
		if (currentStart === null) {
			currentStart = word.start;
			currentSpeaker = speaker;
		}
		current.push(word);
		prevEnd = word.end;
	}
	flush();
	return phrases;
}

function speakerTag(speaker: string | null): string {
	if (!speaker) {
		return "";
	}
	const short = speaker.startsWith("speaker_")
		? speaker.slice("speaker_".length)
		: speaker;
	return ` S${short}`;
}

export function renderPackedMarkdown(
	name: string,
	duration: number,
	phrases: PackPhrase[],
): string {
	const lines = [
		"# Packed transcripts",
		"",
		"Phrase-level, grouped on silences or speaker change.",
		"Use `[start-end]` ranges to address cuts.",
		"",
		`## ${name}  (duration: ${formatDuration(duration)}, ${phrases.length} phrases)`,
	];
	if (phrases.length === 0) {
		lines.push("  _no speech detected_", "");
		return lines.join("\n");
	}
	for (const phrase of phrases) {
		lines.push(
			`  [${formatTime(phrase.start)}-${formatTime(phrase.end)}]${speakerTag(phrase.speaker)} ${phrase.text}`,
		);
	}
	lines.push("");
	return lines.join("\n");
}

/**
 * Render one take's words to packed markdown, uncapped — the full take is
 * always kept so cuts and chapters never lose context to truncation.
 */
export function renderTakePack(
	name: string,
	words: PackWord[],
	duration: number,
	silenceThreshold = SILENCE_THRESHOLD_S,
): string {
	const phrases = groupIntoPhrases(words, silenceThreshold);
	return renderPackedMarkdown(name, duration, phrases);
}

export interface HighlightClip {
	start: number;
	end: number;
	labels: string[];
	score: number;
}

export interface HighlightOptions {
	threshold: number;
	padBefore: number;
	padAfter: number;
	maxClips: number;
}

export const DEFAULT_HIGHLIGHT_OPTIONS: HighlightOptions = {
	threshold: 0.5,
	padBefore: 2.0,
	padAfter: 2.0,
	maxClips: 10,
};

/**
 * Rank event tokens into highlight clips: threshold filter, pad, merge
 * overlaps, keep the top-N by score, chronological out.
 */
export function selectHighlights(
	words: PackWord[],
	options: HighlightOptions = DEFAULT_HIGHLIGHT_OPTIONS,
): HighlightClip[] {
	const events = words.filter(
		(w) =>
			w.type === "audio_event" &&
			(w as { score?: number }).score !== undefined &&
			((w as { score?: number }).score ?? 0) >= options.threshold,
	);
	const padded = events.map((w) => ({
		start: Math.max(0, w.start - options.padBefore),
		end: w.end + options.padAfter,
		labels: [w.text.replace(/^\(|\)$/g, "")],
		score: (w as { score?: number }).score ?? 0,
	}));
	padded.sort((a, b) => a.start - b.start);
	const merged: HighlightClip[] = [];
	for (const clip of padded) {
		const last = merged[merged.length - 1];
		if (last && clip.start <= last.end) {
			last.end = Math.max(last.end, clip.end);
			last.score = Math.max(last.score, clip.score);
			for (const label of clip.labels) {
				if (!last.labels.includes(label)) {
					last.labels.push(label);
				}
			}
		} else {
			merged.push({ ...clip, labels: [...clip.labels] });
		}
	}
	return merged
		.sort((a, b) => b.score - a.score)
		.slice(0, options.maxClips)
		.sort((a, b) => a.start - b.start);
}
