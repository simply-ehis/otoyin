/**
 * Overlays + complex controls tests — render + interaction floor (14).
 *
 * Encodes desktop-ui-surfaces-overlays, buttons-controls, and
 * accessibility-i18n rules: dialogs trap focus and close on Escape with
 * focus restored; tabs use arrow-key roving selection; sliders are fully
 * keyboard-operable; selects open, choose, and announce.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "./dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";
import { Slider } from "./slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Dialog", () => {
	function renderDialog(onOpenChange = vi.fn()) {
		return render(
			<Dialog onOpenChange={onOpenChange}>
				<DialogTrigger>Delete profile</DialogTrigger>
				<DialogContent>
					<DialogTitle>Delete voice?</DialogTitle>
					<DialogDescription>This cannot be undone.</DialogDescription>
					<DialogClose>Cancel</DialogClose>
				</DialogContent>
			</Dialog>,
		);
	}

	it("opens on trigger and labels the dialog", async () => {
		const user = userEvent.setup();
		renderDialog();
		await user.click(screen.getByRole("button", { name: "Delete profile" }));
		expect(
			screen.getByRole("dialog", { name: "Delete voice?" }),
		).toBeInTheDocument();
		expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
	});

	it("closes on Escape", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		renderDialog(onOpenChange);
		await user.click(screen.getByRole("button", { name: "Delete profile" }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("returns focus to the trigger after close", async () => {
		const user = userEvent.setup();
		renderDialog();
		const trigger = screen.getByRole("button", { name: "Delete profile" });
		await user.click(trigger);
		await user.keyboard("{Escape}");
		expect(trigger).toHaveFocus();
	});
});

describe("Tabs", () => {
	function renderTabs() {
		return render(
			<Tabs defaultValue="voices">
				<TabsList aria-label="Library sections">
					<TabsTrigger value="voices">Voices</TabsTrigger>
					<TabsTrigger value="models">Models</TabsTrigger>
					<TabsTrigger value="packs">Packs</TabsTrigger>
				</TabsList>
				<TabsContent value="voices">Voice list</TabsContent>
				<TabsContent value="models">Model list</TabsContent>
				<TabsContent value="packs">Pack list</TabsContent>
			</Tabs>,
		);
	}

	it("shows the default panel and marks its tab selected", () => {
		renderTabs();
		expect(screen.getByText("Voice list")).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Voices" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	it("moves selection with arrow keys (roving tabindex)", async () => {
		const user = userEvent.setup();
		renderTabs();
		const voices = screen.getByRole("tab", { name: "Voices" });
		voices.focus();
		await user.keyboard("{ArrowRight}");
		expect(screen.getByRole("tab", { name: "Models" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByText("Model list")).toBeInTheDocument();
	});
});

describe("Slider", () => {
	// NOTE: fireEvent, not userEvent, for Radix slider keys — userEvent's
	// pointer simulation hits jsdom gaps (hasPointerCapture) that real
	// browsers don't have. Keyboard behavior itself is Radix-native.
	it("changes value with arrow keys and exposes it to assistive tech", () => {
		const onValueChange = vi.fn();
		render(
			<Slider
				aria-label="Gain"
				defaultValue={[50]}
				max={100}
				step={1}
				onValueChange={onValueChange}
			/>,
		);
		const thumb = screen.getByRole("slider", { name: "Gain" });
		expect(thumb).toHaveAttribute("aria-valuenow", "50");
		fireEvent.keyDown(thumb, { key: "ArrowRight" });
		expect(onValueChange).toHaveBeenCalledWith([51]);
	});

	it("jumps to bounds with Home and End", () => {
		const onValueChange = vi.fn();
		render(
			<Slider
				aria-label="Pan"
				defaultValue={[0]}
				min={-50}
				max={50}
				onValueChange={onValueChange}
			/>,
		);
		const thumb = screen.getByRole("slider", { name: "Pan" });
		fireEvent.keyDown(thumb, { key: "End" });
		expect(onValueChange).toHaveBeenCalledWith([50]);
		fireEvent.keyDown(thumb, { key: "Home" });
		expect(onValueChange).toHaveBeenCalledWith([-50]);
	});
});

describe("Select", () => {
	function renderSelect(onValueChange = vi.fn()) {
		return render(
			<Select onValueChange={onValueChange}>
				<SelectTrigger aria-label="Engine">
					<SelectValue placeholder="Pick an engine" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="kokoro">Kokoro</SelectItem>
					<SelectItem value="zonos">Zonos</SelectItem>
				</SelectContent>
			</Select>,
		);
	}

	it("opens the listbox and chooses an option", async () => {
		const onValueChange = vi.fn();
		renderSelect(onValueChange);
		// Radix Select in jsdom: open via keyboard (clicks hit the
		// dismissable-layer pointer-events gap), choose via fireEvent.
		const trigger = screen.getByRole("combobox", { name: "Engine" });
		fireEvent.keyDown(trigger, { key: "ArrowDown" });
		const option = await screen.findByRole("option", { name: "Zonos" });
		fireEvent.click(option);
		expect(onValueChange).toHaveBeenCalledWith("zonos");
	});

	it("announces the placeholder before a choice exists", () => {
		renderSelect();
		expect(screen.getByText("Pick an engine")).toBeInTheDocument();
	});
});
