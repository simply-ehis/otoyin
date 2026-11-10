/**
 * Sidebar — hidden tabs disappear from the nav; groups with no visible tabs
 * collapse entirely; always-on tabs can never be hidden.
 *
 * The sidebar is an accordion: opening one group closes all others. The
 * tests expand one group at a time.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceStore } from "@/stores/workspaceStore";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...actual,
		useRouter: () => ({
			state: { location: { pathname: "/" } },
		}),
		Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
			<a href={String(to)}>{children}</a>
		),
	};
});

import { Sidebar } from "./Sidebar";

const qc = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const renderSidebar = () =>
	render(
		<QueryClientProvider client={qc}>
			<Sidebar />
		</QueryClientProvider>,
	);

beforeEach(() => {
	useWorkspaceStore.setState({
		hiddenTabs: [],
		visibleTabs: null,
		selectedUseCases: [],
		onboarded: true,
	});
});

/** Open a group by its header label (accordion: closes any other group). */
async function openGroup(
	user: ReturnType<typeof userEvent.setup>,
	label: string,
) {
	await user.click(screen.getByRole("button", { name: label }));
}

describe("Sidebar — hidden tabs", () => {
	it("renders all group headers when nothing is hidden", () => {
		renderSidebar();
		for (const label of [
			"Create",
			"Studio",
			"Voice & Transcription",
			"Processing",
			"Video",
			"Music",
			"Library",
			"Store",
			"Settings",
			"Help",
		]) {
			expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
		}
	});

	it("expanding a group reveals its tabs (one group at a time)", async () => {
		const user = userEvent.setup();
		renderSidebar();
		await openGroup(user, "Create");
		expect(screen.getByText("sidebar.generate")).toBeInTheDocument();
		expect(screen.getByText("sidebar.voices")).toBeInTheDocument();

		// Accordion closes Create when Studio opens
		await openGroup(user, "Studio");
		expect(screen.getByText("sidebar.audioStudio")).toBeInTheDocument();
		expect(screen.queryByText("sidebar.generate")).not.toBeInTheDocument();
	});

	it("hides a tab from the nav when hidden via the store", async () => {
		const user = userEvent.setup();
		renderSidebar();
		act(() => {
			useWorkspaceStore.getState().hideTab("/voices");
		});
		await openGroup(user, "Create");
		expect(screen.queryByText("sidebar.voices")).not.toBeInTheDocument();
		expect(screen.getByText("sidebar.generate")).toBeInTheDocument();
	});

	it("collapses the Music group entirely when its only tab is hidden", () => {
		renderSidebar();
		act(() => {
			useWorkspaceStore.getState().hideTab("/music-gen");
		});
		expect(
			screen.queryByRole("button", { name: "Music" }),
		).not.toBeInTheDocument();
	});

	it("keeps /library, /store and /settings visible even when everything else is hidden", async () => {
		const hideable = [
			"/",
			"/voices",
			"/voice-converter",
			"/songwriter",
			"/sounds",
			"/audio-studio",
			"/stories",
			"/launcher",
			"/instruments",
			"/audiobooks",
			"/mixer",
			"/studio",
			"/comping",
			"/spatial",
			"/dsp",
			"/automation",
			"/captures",
			"/translate",
			"/pitch",
			"/spectrogram",
			"/diarize",
			"/effects",
			"/noise-reduction",
			"/audio-enhance",
			"/vocal-isolation",
			"/dubbing",
			"/video",
			"/download",
			"/music-gen",
			"/help",
			"/whats-new",
			"/projects",
			"/community-presets",
		];
		for (const path of hideable) {
			act(() => {
				useWorkspaceStore.getState().hideTab(path);
			});
		}
		const user = userEvent.setup();
		renderSidebar();

		// Every non-always-on group header is gone
		for (const label of [
			"Create",
			"Studio",
			"Voice & Transcription",
			"Processing",
			"Video",
			"Music",
			"Help",
		]) {
			expect(
				screen.queryByRole("button", { name: label }),
			).not.toBeInTheDocument();
		}

		// Always-on groups survive and reveal their tabs
		await openGroup(user, "Library");
		expect(screen.getByText("sidebar.library")).toBeInTheDocument();
		await openGroup(user, "Store");
		expect(screen.getByText("sidebar.store")).toBeInTheDocument();
		await openGroup(user, "Settings");
		expect(screen.getByText("sidebar.settings")).toBeInTheDocument();
	});
});
