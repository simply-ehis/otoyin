/**
 * VoiceConverterView — owner rule: no consent checkbox/gate anywhere.
 * The Convert button must work without any "I agree" step.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		listProfiles: vi.fn(() => Promise.resolve([])),
		getModelStatus: vi.fn(() => Promise.resolve({ models: [] })),
		convertVoice: vi.fn(() => Promise.resolve(new Blob(["wav"]))),
		saveGeneratedAudio: vi.fn(() =>
			Promise.resolve({ id: "cap-1", kind: "capture", title: "x" }),
		),
	},
}));

vi.mock("@/ui/use-toast", () => ({
	useToast: vi.fn(() => ({ toast: vi.fn() })),
}));
vi.mock("./playBlob", () => ({
	playPreviewBlob: vi.fn(() => ({ pause: vi.fn() })),
}));
vi.mock("./VoiceChangerPanel", () => ({
	VoiceChangerPanel: () => <div data-testid="voice-changer-panel" />,
}));

import { VoiceConverterView } from "./VoiceConverterView";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderView = () =>
	render(
		<QueryClientProvider client={qc}>
			<VoiceConverterView />
		</QueryClientProvider>,
	);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("VoiceConverterView consent rule", () => {
	it("renders no consent checkbox", async () => {
		renderView();
		await waitFor(() =>
			expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(),
		);
		expect(screen.queryByText(/consent|i confirm|rights/i)).toBeNull();
	});

	it("convert button does not demand consent", async () => {
		renderView();
		const convert = await screen.findByRole("button", {
			name: /convert voice/i,
		});
		expect(convert).not.toBeDisabled();
		expect(convert.getAttribute("title")).toBe("Convert voice");
	});
});
