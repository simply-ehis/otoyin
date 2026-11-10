/**
 * ThemeSelect — background pattern picker wiring.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "@/stores/uiStore";
import { ThemeSelect } from "./ThemeSelect";

beforeEach(() => {
	useUIStore.setState({ backgroundPattern: "line-in-motion" });
});

describe("ThemeSelect background picker", () => {
	it("offers line-in-motion, waveform and none", () => {
		render(<ThemeSelect />);
		expect(
			screen.getByRole("button", { name: "Line in motion" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Waveform" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
	});

	it("defaults to line-in-motion and persists the choice in the store", async () => {
		const user = userEvent.setup();
		render(<ThemeSelect />);
		expect(useUIStore.getState().backgroundPattern).toBe("line-in-motion");

		await user.click(screen.getByRole("button", { name: "Waveform" }));
		expect(useUIStore.getState().backgroundPattern).toBe("waveform");

		await user.click(screen.getByRole("button", { name: "None" }));
		expect(useUIStore.getState().backgroundPattern).toBe("none");

		await user.click(screen.getByRole("button", { name: "Line in motion" }));
		expect(useUIStore.getState().backgroundPattern).toBe("line-in-motion");
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
