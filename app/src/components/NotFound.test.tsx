import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NotFound, SettingsNotFound } from "./NotFound";

// Stub TanStack's Link with a plain anchor so the fallback renders outside a
// router instance (the real defaultNotFoundComponent can mount at the root).
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children }: { to: string; children?: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

describe("NotFound (router default)", () => {
	it("shows a way back to the studio and to settings", () => {
		render(<NotFound />);

		expect(
			screen.getByRole("heading", { name: /doesn’t exist/i }),
		).toBeInTheDocument();

		const home = screen.getByRole("link", { name: /Back to the studio/i });
		expect(home).toHaveAttribute("href", "/");

		const settings = screen.getByRole("link", { name: /Open Settings/i });
		expect(settings).toHaveAttribute("href", "/settings");
	});
});

describe("SettingsNotFound (settings route outlet)", () => {
	it("shows a way back to the General page", () => {
		render(<SettingsNotFound />);

		expect(
			screen.getByRole("heading", { name: /Settings page not found/i }),
		).toBeInTheDocument();

		const back = screen.getByRole("link", { name: /Back to General/i });
		expect(back).toHaveAttribute("href", "/settings");
	});
});
