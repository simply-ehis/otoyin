import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoiceCleanABToggle } from "./VoiceCleanABToggle";

// Mock the API client chain
vi.mock("@/lib/api/client", () => {
	class GenerationsMethods {
		async request<T>(): Promise<T> {
			return {} as T;
		}
	}
	return {
		__esModule: true,
		default: new GenerationsMethods(),
		GenerationsMethods,
	};
});

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, unknown>) =>
			opts?.defaultValue ?? key,
	}),
}));

vi.mock("@/components/ui/use-toast", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

describe("VoiceCleanABToggle", () => {
	it("renders into the DOM", () => {
		const { container } = render(
			<VoiceCleanABToggle audioPath="/audio/test.wav" engine="kokoro" />,
		);
		expect(container.firstChild).toBeTruthy();
	});

	it("renders in compact mode", () => {
		const { container } = render(
			<VoiceCleanABToggle
				audioPath="/audio/test.wav"
				engine="kokoro"
				compact
			/>,
		);
		expect(container.firstChild).toBeTruthy();
	});

	it("renders without compact mode", () => {
		const { container } = render(
			<VoiceCleanABToggle
				audioPath="/audio/test.wav"
				engine="kokoro"
				compact={false}
			/>,
		);
		expect(container.firstChild).toBeTruthy();
	});

	it("accepts optional engine prop", () => {
		const { container } = render(
			<VoiceCleanABToggle audioPath="/audio/test.wav" engine="kokoro" />,
		);
		expect(container.firstChild).toBeTruthy();
	});
});

describe("WaveformABDiff", () => {
	it("exports WaveformABDiff component", async () => {
		const mod = await import("./WaveformABDiff");
		expect(typeof mod.WaveformABDiff).toBe("function");
	});
});
