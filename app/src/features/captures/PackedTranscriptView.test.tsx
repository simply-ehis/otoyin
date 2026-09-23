import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PackedTranscriptView } from "./PackedTranscriptView";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const fetchMock = vi.fn();
const chaptersMock = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/api/client", () => ({
	apiClient: {
		fetchCaptureWordsJson: (...args: unknown[]) => fetchMock(...args),
		fetchCaptureChapters: (...args: unknown[]) => chaptersMock(...args),
	},
}));

const DOC = {
	text: "We fixed this",
	words: [
		{
			text: "We",
			start: 6.08,
			end: 6.4,
			type: "word",
			speaker_id: "speaker_0",
		},
		{
			text: "fixed",
			start: 6.5,
			end: 6.9,
			type: "word",
			speaker_id: "speaker_0",
		},
		{
			text: "this.",
			start: 7.0,
			end: 7.4,
			type: "word",
			speaker_id: "speaker_0",
		},
	],
};

describe("PackedTranscriptView", () => {
	it("renders packed markdown from words JSON", async () => {
		fetchMock.mockResolvedValueOnce(DOC);
		render(<PackedTranscriptView captureId="abc123" />);
		await waitFor(() => {
			expect(screen.getByText(/S0 We fixed this\./)).toBeTruthy();
		});
		expect(screen.getByText("captures.transcript.copyPack")).toBeTruthy();
		expect(screen.getByText("captures.transcript.downloadPack")).toBeTruthy();
	});

	it("shows the empty hint when no words JSON exists", async () => {
		fetchMock.mockResolvedValueOnce(null);
		render(<PackedTranscriptView captureId="abc123" />);
		await waitFor(() => {
			expect(screen.getByText("captures.transcript.packedEmpty")).toBeTruthy();
		});
	});

	it("lists highlights from scored events", async () => {
		fetchMock.mockResolvedValueOnce({
			text: "ha",
			words: [
				{
					text: "ha",
					start: 1.0,
					end: 1.5,
					type: "word",
					speaker_id: "speaker_0",
				},
				{
					text: "laughter",
					start: 2.0,
					end: 2.9,
					type: "audio_event",
					score: 0.9,
				},
			],
		});
		render(<PackedTranscriptView captureId="abc123" />);
		await waitFor(() => {
			expect(screen.getByText("captures.transcript.highlights")).toBeTruthy();
		});
		expect(screen.getByText("captures.transcript.copyHighlights")).toBeTruthy();
	});

	it("lists chapters from the chapters endpoint", async () => {
		fetchMock.mockResolvedValueOnce({ text: "a b", words: [] });
		chaptersMock.mockResolvedValueOnce({
			chapters: [{ index: 0, title: "intro", start: 0.0, end: 5.0 }],
		});
		render(<PackedTranscriptView captureId="abc123" />);
		await waitFor(() => {
			expect(screen.getByText("captures.transcript.chapters")).toBeTruthy();
		});
		expect(screen.getByText(/intro/)).toBeTruthy();
		expect(screen.getByText("captures.transcript.copyChapters")).toBeTruthy();
	});
});
