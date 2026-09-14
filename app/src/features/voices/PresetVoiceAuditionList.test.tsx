import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresetVoiceAuditionList } from "@/features/voices/PresetVoiceAuditionList";

const auditionMock = vi.fn();
vi.mock("@/features/generate/usePresetAudition", async (importOriginal) => {
	const mod =
		await importOriginal<
			typeof import("@/features/generate/usePresetAudition")
		>();
	return {
		...mod,
		usePresetAudition: () => ({
			audition: auditionMock,
			loadingVoiceId: null,
			isPreviewPlaying: () => false,
		}),
	};
});

const voices = [
	{ id: "af_heart", name: "Heart", gender: "female", language: "en" },
	{ id: "am_adam", name: "Adam", gender: "male", language: "en" },
];

beforeEach(() => {
	auditionMock.mockClear();
});

describe("PresetVoiceAuditionList", () => {
	it("renders nothing without voices", () => {
		const { container } = render(
			<PresetVoiceAuditionList engine="kokoro" voices={[]} downloaded />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("expands to the voice list and auditions on click", async () => {
		const user = userEvent.setup();
		render(
			<PresetVoiceAuditionList engine="kokoro" voices={voices} downloaded />,
		);
		await user.click(
			screen.getByRole("button", { name: "Hear 2 voices" }),
		);
		const hearHeart = await screen.findByRole("button", {
			name: "Hear Heart preview",
		});
		expect(
			screen.getByRole("button", { name: "Hear Adam preview" }),
		).toBeInTheDocument();
		await user.click(hearHeart);
		expect(auditionMock).toHaveBeenCalledWith(voices[0]);
	});

	it("asks for a download instead of buttons when the model is missing", async () => {
		const user = userEvent.setup();
		render(
			<PresetVoiceAuditionList
				engine="kokoro"
				voices={voices}
				downloaded={false}
			/>,
		);
		await user.click(
			screen.getByRole("button", { name: "Hear 2 voices" }),
		);
		expect(
			await screen.findByText("Download this model to hear its voices."),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Hear Heart preview" }),
		).not.toBeInTheDocument();
	});
});
