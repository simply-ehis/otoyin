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
import { useUIStore } from "@/stores/uiStore";
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
	useUIStore.setState({ sidebarOpen: true });
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
			"Help",
		]) {
			expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
		}
		// Single-tab groups render as direct links, not accordion folders
		for (const label of [
			"sidebar.musicGen",
			"sidebar.library",
			"sidebar.store",
			"sidebar.settings",
		]) {
			expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
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
			"/conversation",
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
			"/timeline",
			"/batch",
			"/audio-plan",
			"/captures",
			"/translate",
			"/pitch",
			"/spectrogram",
			"/diarize",
			"/transcript",
			"/effects",
			"/noise-reduction",
			"/audio-enhance",
			"/vocal-isolation",
			"/export",
			"/dubbing",
			"/adr",
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
		renderSidebar();

		// Every non-always-on group disappears entirely (multi-tab groups lose
		// their accordion; single-tab groups lose their direct link).
		for (const label of [
			"Create",
			"Studio",
			"Voice & Transcription",
			"Processing",
			"Video",
			"Help",
		]) {
			expect(
				screen.queryByRole("button", { name: label }),
			).not.toBeInTheDocument();
		}
		expect(
			screen.queryByRole("link", { name: "sidebar.musicGen" }),
		).not.toBeInTheDocument();

		// Always-on single-tab groups render as direct links, not folders
		expect(
			screen.getByRole("link", { name: "sidebar.library" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "sidebar.store" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "sidebar.settings" }),
		).toBeInTheDocument();
	});
});

describe("Sidebar — collapsed rail", () => {
	it("tapping a folded group unfolds the sidebar and opens its sub-tabs", async () => {
		useUIStore.setState({ sidebarOpen: false });
		const user = userEvent.setup();
		renderSidebar();
		// Collapsed: the group icon is a button labelled with the group name
		expect(useUIStore.getState().sidebarOpen).toBe(false);
		// Sub-tab labels are not rendered while collapsed
		expect(screen.queryByText("sidebar.audioStudio")).not.toBeInTheDocument();

		await openGroup(user, "Studio");

		expect(useUIStore.getState().sidebarOpen).toBe(true);
		expect(screen.getByText("sidebar.audioStudio")).toBeInTheDocument();
	});
});
