/**
 * Canonical input tests — render + interaction floor (prompt 14).
 *
 * Encodes desktop-ui-text-inputs + accessibility-i18n rules: labels persist
 * (never placeholder-only), errors are programmatically associated with the
 * field, search clear is keyboard-reachable with an accessible name.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field, Input, SearchInput, Textarea } from "./input";

describe("Input", () => {
	it("renders and accepts typing", async () => {
		const user = userEvent.setup();
		render(<Input aria-label="Voice name" />);
		const box = screen.getByRole("textbox", { name: "Voice name" });
		await user.type(box, "Ada");
		expect(box).toHaveValue("Ada");
	});

	it("flags invalid state for assistive tech", () => {
		render(<Input aria-label="Sample rate" aria-invalid="true" />);
		const box = screen.getByRole("textbox", { name: "Sample rate" });
		expect(box).toHaveAttribute("aria-invalid", "true");
		expect(box.className).toContain("border-destructive");
	});
});

describe("Field", () => {
	it("associates label, control, and error text", () => {
		render(
			<Field label="Voice name" htmlFor="voice-name" error="Name is required">
				<Input id="voice-name" aria-describedby="voice-name-error" />
			</Field>,
		);
		expect(screen.getByLabelText("Voice name")).toBeInTheDocument();
		const alert = screen.getByRole("alert");
		expect(alert).toHaveTextContent("Name is required");
		expect(alert).toHaveAttribute("id", "voice-name-error");
	});

	it("renders hint text when there is no error", () => {
		render(
			<Field label="Seed" htmlFor="seed" hint="Same seed, same take">
				<Input id="seed" />
			</Field>,
		);
		expect(screen.getByText("Same seed, same take")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});

describe("SearchInput", () => {
	it("shows the clear button only when there is a value, and clears on click", async () => {
		const user = userEvent.setup();
		const onClear = vi.fn();
		const { rerender } = render(
			<SearchInput
				aria-label="Search voices"
				value=""
				onChange={() => {}}
				onClear={onClear}
			/>,
		);
		expect(
			screen.queryByRole("button", { name: "Clear search" }),
		).not.toBeInTheDocument();

		rerender(
			<SearchInput
				aria-label="Search voices"
				value="ada"
				onChange={() => {}}
				onClear={onClear}
			/>,
		);
		const clear = screen.getByRole("button", { name: "Clear search" });
		await user.click(clear);
		expect(onClear).toHaveBeenCalledTimes(1);
	});

	it("exposes the searchbox role for screen readers", () => {
		render(<SearchInput aria-label="Search models" />);
		expect(
			screen.getByRole("searchbox", { name: "Search models" }),
		).toBeInTheDocument();
	});
});

describe("Textarea", () => {
	it("renders a labeled multiline field", async () => {
		const user = userEvent.setup();
		render(<Textarea aria-label="Script" rows={4} />);
		const area = screen.getByRole("textbox", { name: "Script" });
		await user.type(area, "Line one");
		expect(area).toHaveValue("Line one");
	});
});
