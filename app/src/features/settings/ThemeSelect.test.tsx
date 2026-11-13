/**
 * ThemeSelect — background pattern picker wiring.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "@/stores/uiStore";
import { ThemeSelect } from "./ThemeSelect";

beforeEach(() => {
	useUIStore.setState({
		backgroundPattern: "line-in-motion",
		accent: "rose",
		theme: "system",
	});
});

describe("ThemeSelect background picker", () => {
	it("offers line-in-motion, waveform, mesh and none", () => {
		render(<ThemeSelect />);
		expect(
			screen.getByRole("button", { name: "Line in motion" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Waveform" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Mesh" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
	});

	it("defaults to line-in-motion and persists the choice in the store", async () => {
		const user = userEvent.setup();
		render(<ThemeSelect />);
		expect(useUIStore.getState().backgroundPattern).toBe("line-in-motion");

		await user.click(screen.getByRole("button", { name: "Mesh" }));
		expect(useUIStore.getState().backgroundPattern).toBe("mesh");

		await user.click(screen.getByRole("button", { name: "None" }));
		expect(useUIStore.getState().backgroundPattern).toBe("none");

		await user.click(screen.getByRole("button", { name: "Line in motion" }));
		expect(useUIStore.getState().backgroundPattern).toBe("line-in-motion");
	});

	it("switches the accent to the chosen preset", async () => {
		const user = userEvent.setup();
		render(<ThemeSelect />);
		expect(useUIStore.getState().accent).toBe("rose");

		await user.click(screen.getByRole("button", { name: "Accent: Blue" }));
		expect(useUIStore.getState().accent).toBe("blue");

		await user.click(screen.getByRole("button", { name: "Accent: Violet" }));
		expect(useUIStore.getState().accent).toBe("violet");
	});

	it("switches the active theme and keeps the accent across theme changes", async () => {
		const user = userEvent.setup();
		render(<ThemeSelect />);
		expect(useUIStore.getState().theme).toBe("system");

		await user.click(screen.getByRole("button", { name: "Accent: Blue" }));
		await user.click(screen.getByRole("button", { name: "Stripe" }));
		expect(useUIStore.getState().theme).toBe("stripe");
		expect(useUIStore.getState().accent).toBe("blue");

		await user.click(screen.getByRole("button", { name: "Dark" }));
		expect(useUIStore.getState().theme).toBe("dark");
		expect(useUIStore.getState().accent).toBe("blue");
	});

	it("aria-pressed reflects the active background", async () => {
		const user = userEvent.setup();
		render(<ThemeSelect />);
		expect(
			screen.getByRole("button", { name: "Line in motion" }),
		).toHaveAttribute("aria-pressed", "true");
		await user.click(screen.getByRole("button", { name: "Waveform" }));
		expect(screen.getByRole("button", { name: "Waveform" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(
			screen.getByRole("button", { name: "Line in motion" }),
		).toHaveAttribute("aria-pressed", "false");
	});
});
