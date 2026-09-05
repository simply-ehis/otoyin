/**
 * Overlay primitives tests — render + interaction floor (14).
 *
 * Encodes desktop-ui-surfaces-overlays + accessibility-i18n rules:
 * destructive confirmations announce as alertdialog, Escape/scrim
 * behavior, checkbox menu state, popover dismissal, tooltip naming.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "./alert-dialog";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerTitle,
	DrawerTrigger,
} from "./drawer";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from "./popover";
import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

describe("AlertDialog", () => {
	function renderDialog(onConfirm = vi.fn()) {
		return render(
			<AlertDialog>
				<AlertDialogTrigger>Delete voice</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogTitle>Delete this voice?</AlertDialogTitle>
					<AlertDialogDescription>
						The profile and its samples go away.
					</AlertDialogDescription>
					<AlertDialogCancel>Keep</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
				</AlertDialogContent>
			</AlertDialog>,
		);
	}

	it("announces as an alertdialog with consequence text", async () => {
		const user = userEvent.setup();
		renderDialog();
		await user.click(screen.getByRole("button", { name: "Delete voice" }));
		const dialog = screen.getByRole("alertdialog", {
			name: "Delete this voice?",
		});
		expect(dialog).toBeInTheDocument();
		expect(
			screen.getByText("The profile and its samples go away."),
		).toBeInTheDocument();
	});

	it("confirm fires once with the destructive variant", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		renderDialog(onConfirm);
		await user.click(screen.getByRole("button", { name: "Delete voice" }));
		const confirm = screen.getByRole("button", { name: "Delete" });
		expect(confirm.className).toContain("bg-destructive");
		await user.click(confirm);
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("cancel dismisses without confirming", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		renderDialog(onConfirm);
		await user.click(screen.getByRole("button", { name: "Delete voice" }));
		await user.click(screen.getByRole("button", { name: "Keep" }));
		expect(onConfirm).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});
});

describe("Drawer", () => {
	it("opens from the right edge and closes on Escape", async () => {
		const user = userEvent.setup();
		render(
			<Drawer>
				<DrawerTrigger>Inspect</DrawerTrigger>
				<DrawerContent>
					<DrawerTitle>Clip inspector</DrawerTitle>
					<DrawerClose>Done</DrawerClose>
				</DrawerContent>
			</Drawer>,
		);
		await user.click(screen.getByRole("button", { name: "Inspect" }));
		const dialog = screen.getByRole("dialog", { name: "Clip inspector" });
		expect(dialog.className).toContain("right-0");
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("anchors left on request with a labeled close control", async () => {
		const user = userEvent.setup();
		render(
			<Drawer>
				<DrawerTrigger>Open</DrawerTrigger>
				<DrawerContent side="left">
					<DrawerTitle>Left panel</DrawerTitle>
				</DrawerContent>
			</Drawer>,
		);
		await user.click(screen.getByRole("button", { name: "Open" }));
		expect(screen.getByRole("dialog").className).toContain("left-0");
		expect(
			screen.getByRole("button", { name: "Close panel" }),
		).toBeInTheDocument();
	});
});

describe("DropdownMenu", () => {
	function renderMenu(onPick = vi.fn()) {
		return render(
			<DropdownMenu>
				<DropdownMenuTrigger>Actions</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem onSelect={onPick}>Rename</DropdownMenuItem>
					<DropdownMenuItem disabled>Disabled thing</DropdownMenuItem>
					<DropdownMenuCheckboxItem checked={false} onCheckedChange={() => {}}>
						Pin
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
	}

	it("opens on trigger and activates an item", async () => {
		const user = userEvent.setup();
		const onPick = vi.fn();
		renderMenu(onPick);
		await user.click(screen.getByRole("button", { name: "Actions" }));
		await user.click(screen.getByRole("menuitem", { name: "Rename" }));
		expect(onPick).toHaveBeenCalledTimes(1);
	});

	it("moves with arrow keys and marks disabled items", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: "Actions" }));
		const rename = screen.getByRole("menuitem", { name: "Rename" });
		rename.focus();
		await user.keyboard("{ArrowDown}");
		expect(
			screen.getByRole("menuitem", { name: "Disabled thing" }),
		).toHaveAttribute("aria-disabled", "true");
	});

	it("renders checkbox state for the pinned row", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: "Actions" }));
		expect(
			screen.getByRole("menuitemcheckbox", { name: "Pin" }),
		).toHaveAttribute("aria-checked", "false");
	});
});

describe("Popover", () => {
	it("opens anchored content and closes on Escape", async () => {
		const user = userEvent.setup();
		const onPick = vi.fn();
		render(
			<Popover>
				<PopoverTrigger>More</PopoverTrigger>
				<PopoverContent>
					<PopoverItem onClick={onPick}>Duplicate</PopoverItem>
				</PopoverContent>
			</Popover>,
		);
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(screen.getByRole("button", { name: "Duplicate" }));
		expect(onPick).toHaveBeenCalledTimes(1);
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.keyboard("{Escape}");
		expect(
			screen.queryByRole("button", { name: "Duplicate" }),
		).not.toBeInTheDocument();
	});
});

describe("Tooltip", () => {
	function renderTip() {
		return render(
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<button type="button" aria-label="Play preview">
							▶
						</button>
					</TooltipTrigger>
					<TooltipContent shortcut="Space">Play preview</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);
	}

	it("shows label text plus shortcut on hover", async () => {
		const user = userEvent.setup();
		renderTip();
		await user.hover(screen.getByRole("button", { name: "Play preview" }));
		expect(await screen.findByText("Play preview")).toBeInTheDocument();
		expect(screen.getByText("Space")).toBeInTheDocument();
	});

	it("IconButton bakes in tooltip and accessible name together", () => {
		render(
			<TooltipProvider delayDuration={0}>
				<IconButton label="Stop" shortcut="S">
					■
				</IconButton>
			</TooltipProvider>,
		);
		const btn = screen.getByRole("button", { name: "Stop" });
		expect(btn).toHaveAttribute("title", "Stop");
		expect(btn).toHaveAttribute("aria-label", "Stop");
	});
});
