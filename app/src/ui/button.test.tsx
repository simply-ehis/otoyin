/**
 * Canonical Button tests — render + interaction floor (prompt 14).
 *
 * Encodes desktop-ui-buttons-controls rules: clear primary/secondary/
 * destructive hierarchy, keyboard operability, visible focus, loading and
 * disabled states that actually block activation.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
	it("renders children with the default variant", () => {
		render(<Button>Generate</Button>);
		const btn = screen.getByRole("button", { name: "Generate" });
		expect(btn).toBeInTheDocument();
		expect(btn.className).toContain("bg-primary");
	});

	it.each([
		["secondary", "bg-secondary"],
		["outline", "border"],
		["ghost", "text-muted-foreground"],
		["destructive", "bg-destructive"],
	] as const)("renders the %s variant distinctly", (variant, cls) => {
		render(<Button variant={variant}>{variant}</Button>);
		expect(screen.getByRole("button", { name: variant }).className).toContain(cls);
	});

	it("activates via keyboard (Enter) like a native button", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(<Button onClick={onClick}>Speak</Button>);
		const btn = screen.getByRole("button", { name: "Speak" });
		btn.focus();
		expect(btn).toHaveFocus();
		await user.keyboard("{Enter}");
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("does not fire onClick when disabled", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(
			<Button disabled onClick={onClick}>
				Blocked
			</Button>,
		);
		await user.click(screen.getByRole("button", { name: "Blocked" }));
		expect(onClick).not.toHaveBeenCalled();
	});

	it("loading state blocks clicks and exposes aria-busy", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(
			<Button loading onClick={onClick}>
				Working
			</Button>,
		);
		const btn = screen.getByRole("button", { name: "Working" });
		expect(btn).toBeDisabled();
		expect(btn).toHaveAttribute("aria-busy", "true");
		await user.click(btn);
		expect(onClick).not.toHaveBeenCalled();
	});

	it("icon size stays a square hit target", () => {
		render(
			<Button size="icon" aria-label="Play">
				▶
			</Button>,
		);
		const btn = screen.getByRole("button", { name: "Play" });
		expect(btn.className).toContain("h-9");
		expect(btn.className).toContain("w-9");
	});
});
