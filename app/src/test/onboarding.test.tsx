/**
 * Onboarding tests — first-visit memory, tab mapping, intro behavior.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabIntroCard } from "@/features/onboarding/TabIntro";
import { introForPath, introForTab, tabIdForPath } from "@/lib/onboarding";
import { useOnboardingStore } from "@/stores/onboardingStore";

function resetStore() {
	useOnboardingStore.setState({ seenTabs: [] });
	localStorage.removeItem("otoyin-onboarding");
}

describe("onboarding store", () => {
	it("records each tab once and resets", () => {
		resetStore();
		const { markSeen, resetOnboarding } = useOnboardingStore.getState();
		markSeen("voices");
		markSeen("voices");
		expect(useOnboardingStore.getState().seenTabs).toEqual(["voices"]);
		resetOnboarding();
		expect(useOnboardingStore.getState().seenTabs).toEqual([]);
	});
});

describe("tab mapping", () => {
	it("maps root to generate and unknown paths to null", () => {
		expect(tabIdForPath("/")).toBe("generate");
		expect(tabIdForPath("/voices")).toBe("voices");
		expect(tabIdForPath("/settings/general")).toBe("settings");
		expect(tabIdForPath("/nope")).toBeNull();
	});

	it("every intro has 2–3 steps and no empty strings", () => {
		for (const tabId of [
			"generate",
			"stories",
			"audiobooks",
			"voices",
			"captures",
			"effects",
			"models",
			"store",
			"settings",
			"workspace",
			"timeline",
			"mixer",
			"studio",
			"dubbing",
			"instruments",
			"telemetry",
			"dsp",
			"adr",
		] as const) {
			const intro = introForTab(tabId);
			expect(intro, tabId).toBeDefined();
			expect(intro?.steps.length).toBeGreaterThanOrEqual(2);
			expect(intro?.steps.length).toBeLessThanOrEqual(3);
			for (const step of intro?.steps ?? []) {
				expect(step.trim().length).toBeGreaterThan(0);
			}
		}
		expect(introForPath("/unknown-xyz")).toBeUndefined();
	});
});

describe("TabIntroCard", () => {
	it("renders numbered steps and dismisses", async () => {
		const user = userEvent.setup();
		const onDismiss = vi.fn();
		const intro = introForTab("voices");
		if (!intro) {
			throw new Error("missing voices intro");
		}
		render(<TabIntroCard intro={intro} onDismiss={onDismiss} />);
		expect(
			screen.getByRole("heading", { name: /first time in/i }),
		).toBeInTheDocument();
		expect(screen.getByText("1")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Dismiss" }));
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});
});
