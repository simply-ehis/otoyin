import { describe, expect, it } from "vitest";
import {
	formatDuration,
	formatTime,
	groupIntoPhrases,
	renderPackedMarkdown,
	selectHighlights,
} from "./packTranscript";

describe("formatTime", () => {
	it("pads to fixed width", () => {
		expect(formatTime(2.52)).toBe("002.52");
		expect(formatTime(65.5)).toBe("065.50");
	});
});

describe("formatDuration", () => {
	it("uses seconds under a minute", () => {
		expect(formatDuration(43.0)).toBe("43.0s");
	});
	it("uses minutes above", () => {
		expect(formatDuration(125.5)).toBe("2m 05.5s");
	});
});

describe("groupIntoPhrases", () => {
	it("breaks on long silences", () => {
		const words = [
			{
				text: "a",
				start: 0.0,
				end: 0.5,
				type: "word",
				speaker_id: "speaker_0",
			},
			{
				text: "b",
				start: 1.5,
				end: 2.0,
				type: "word",
				speaker_id: "speaker_0",
			},
		];
		const phrases = groupIntoPhrases(words, 0.5);
		expect(phrases).toHaveLength(2);
		expect(phrases[0].text).toBe("a");
		expect(phrases[1].text).toBe("b");
	});

	it("breaks on speaker change", () => {
		const words = [
			{
				text: "a",
				start: 0.0,
				end: 0.5,
				type: "word",
				speaker_id: "speaker_0",
			},
			{
				text: "b",
				start: 0.6,
				end: 1.0,
				type: "word",
				speaker_id: "speaker_1",
			},
		];
		const phrases = groupIntoPhrases(words, 0.5);
		expect(phrases).toHaveLength(2);
		expect(phrases[1].speaker).toBe("speaker_1");
	});

	it("parenthesizes bare audio events", () => {
		const words = [
			{
				text: "a",
				start: 0.0,
				end: 0.5,
				type: "word",
				speaker_id: "speaker_0",
			},
			{
				text: "laughter",
				start: 0.6,
				end: 1.0,
				type: "audio_event",
				speaker_id: null,
			},
		];
		const phrases = groupIntoPhrases(words, 0.5);
		expect(phrases).toHaveLength(1);
		expect(phrases[0].text).toContain("(laughter)");
	});

	it("uses spacing entries for silence info", () => {
		const words = [
			{
				text: "a",
				start: 0.0,
				end: 0.5,
				type: "word",
				speaker_id: "speaker_0",
			},
			{ text: " ", start: 0.5, end: 1.5, type: "spacing", speaker_id: null },
			{
				text: "b",
				start: 1.5,
				end: 2.0,
				type: "word",
				speaker_id: "speaker_0",
			},
		];
		expect(groupIntoPhrases(words, 0.5)).toHaveLength(2);
	});
});

describe("renderPackedMarkdown", () => {
	it("matches the video-use pack shape", () => {
		const md = renderPackedMarkdown("C0103", 43.0, [
			{ start: 2.52, end: 5.36, text: "We fixed this.", speaker: "speaker_0" },
		]);
		expect(md).toContain("# Packed transcripts");
		expect(md).toContain("## C0103  (duration: 43.0s, 1 phrases)");
		expect(md).toContain("[002.52-005.36] S0 We fixed this.");
	});

	it("marks empty takes", () => {
		expect(renderPackedMarkdown("C0104", 0, [])).toContain(
			"_no speech detected_",
		);
	});
});

describe("selectHighlights", () => {
	const events = [
		{
			text: "laughter",
			start: 10.0,
			end: 11.0,
			type: "audio_event",
			score: 0.9,
		},
		{
			text: "laughter",
			start: 11.2,
			end: 12.0,
			type: "audio_event",
			score: 0.6,
		},
		{ text: "cough", start: 30.0, end: 30.5, type: "audio_event", score: 0.4 },
	];

	it("pads, merges overlaps, and ranks by score", () => {
		const clips = selectHighlights(events, {
			threshold: 0.5,
			padBefore: 2,
			padAfter: 2,
			maxClips: 10,
		});
		expect(clips).toHaveLength(1);
		expect(clips[0]).toMatchObject({
			start: 8.0,
			end: 14.0,
			labels: ["laughter"],
		});
	});

	it("drops below-threshold events", () => {
		const clips = selectHighlights(events, {
			threshold: 0.95,
			padBefore: 0,
			padAfter: 0,
			maxClips: 10,
		});
		expect(clips).toHaveLength(0);
	});

	it("caps clip count by score", () => {
		const many = Array.from({ length: 20 }, (_, i) => ({
			text: "laughter",
			start: i * 10,
			end: i * 10 + 1,
			type: "audio_event",
			score: i / 20,
		}));
		const clips = selectHighlights(many, {
			threshold: 0.0,
			padBefore: 0,
			padAfter: 0,
			maxClips: 5,
		});
		expect(clips).toHaveLength(5);
	});

	it("clamps start at zero", () => {
		const clips = selectHighlights(
			[{ text: "sigh", start: 0.2, end: 0.8, type: "audio_event", score: 0.9 }],
			{ threshold: 0.5, padBefore: 2, padAfter: 2, maxClips: 10 },
		);
		expect(clips[0].start).toBe(0);
	});
});
