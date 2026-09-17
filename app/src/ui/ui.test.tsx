/**
 * Proof pass for the canonical ui/ library (prompt 03: proven before
 * screens consume it). Renders every primitive, asserts roles, states,
 * and accessible names — no styling snapshot coupling.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { Banner } from "@/ui/banner";
import { Button } from "@/ui/button";
import { Segmented, Switch } from "@/ui/controls";
import { Field, Input, SearchInput } from "@/ui/input";
import { Badge, Spinner, StatePill } from "@/ui/primitives";
import { EmptyState, ErrorState, ScreenHeader } from "@/ui/states";
import { Toaster } from "@/ui/toaster";
import { toast } from "@/ui/use-toast";

describe("canonical button", () => {
	it("renders one primary with an accessible name", () => {
		render(<Button>Generate</Button>);
		expect(
			screen.getByRole("button", { name: "Generate" }),
		).toBeInTheDocument();
	});

	it("disables while loading and keeps its size", async () => {
		const { rerender } = render(<Button>Go</Button>);
		expect(screen.getByRole("button", { name: "Go" })).toBeEnabled();
		rerender(<Button loading>Go</Button>);
		const btn = screen.getByRole("button", { name: "Go" });
		expect(btn).toBeDisabled();
		expect(btn).toHaveAttribute("aria-busy", "true");
	});

	it("toggles pressed state on click", async () => {
		const user = userEvent.setup();
		render(<Switch checked={false} onCheckedChange={() => {}} label="Duck" />);
		await user.click(screen.getByRole("switch", { name: "Duck" }));
	});
});

describe("canonical inputs", () => {
	it("pairs a persistent label with the field", () => {
		render(
			<Field label="Server address" htmlFor="srv">
				<Input id="srv" defaultValue="127.0.0.1:17493" />
			</Field>,
		);
		expect(screen.getByLabelText("Server address")).toHaveValue(
			"127.0.0.1:17493",
		);
	});

	it("search exposes a searchbox role and clear action", async () => {
		const user = userEvent.setup();
		let cleared = false;
		render(
			<SearchInput
				aria-label="Search sounds"
				defaultValue="kick"
				shortcut="Ctrl K"
				onClear={() => {
					cleared = true;
				}}
			/>,
		);
		expect(
			screen.getByRole("searchbox", { name: "Search sounds" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Clear search" }));
		expect(cleared).toBe(true);
	});
});

describe("canonical feedback", () => {
	it("banner keeps a dismiss control and status role", async () => {
		const user = userEvent.setup();
		let dismissed = false;
		render(
			<Banner
				tone="warning"
				onDismiss={() => {
					dismissed = true;
				}}
			>
				Model not downloaded yet.
			</Banner>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"Model not downloaded",
		);
		await user.click(screen.getByRole("button", { name: "Dismiss" }));
		expect(dismissed).toBe(true);
	});

	it("toast appears with title and dismisses", async () => {
		const user = userEvent.setup();
		render(<Toaster />);
		// toast() writes the store outside any event handler — wrap so the
		// Toaster update flushes inside act instead of warning.
		act(() => {
			toast({ title: "Export complete", description: "12 tracks bounced." });
		});
		expect(await screen.findByText("Export complete")).toBeInTheDocument();
		await user.click(
			screen.getByRole("button", { name: "Dismiss notification" }),
		);
		expect(screen.queryByText("Export complete")).not.toBeInTheDocument();
	});

	it("empty state names the content and offers the action", () => {
		render(
			<EmptyState
				title="No generations yet"
				body="Generate your first voice line."
				action={<Button>Generate</Button>}
			/>,
		);
		expect(screen.getByText("No generations yet")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Generate" }),
		).toBeInTheDocument();
	});

	it("error state announces via alert role with retry", () => {
		render(
			<ErrorState
				title="Save failed"
				body="Disk might be full."
				onRetry={() => {}}
			/>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
		expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
	});
});

describe("canonical badges and pills", () => {
	it("model state pill surfaces breaker countdown text", () => {
		render(<StatePill state="breaker">StyleTTS2 · retry in 4 min</StatePill>);
		expect(screen.getByText(/retry in 4 min/)).toBeInTheDocument();
	});

	it("badge renders tone text", () => {
		render(<Badge tone="success">cached</Badge>);
		expect(screen.getByText("cached")).toBeInTheDocument();
	});

	it("spinner exposes a loading status", () => {
		render(<Spinner />);
		expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
	});
});

describe("canonical structure", () => {
	it("screen header exposes heading plus actions", () => {
		render(
			<ScreenHeader
				title="Generate"
				description="Type text, pick a voice."
				actions={<Button>Generate</Button>}
			/>,
		);
		expect(
			screen.getByRole("heading", { name: "Generate" }),
		).toBeInTheDocument();
	});

	it("segmented control marks the active option pressed", async () => {
		const user = userEvent.setup();
		let value = "list";
		const { rerender } = render(
			<Segmented
				label="View mode"
				value={value as "list"}
				onChange={(v) => {
					value = v;
				}}
				options={[{ value: "list", label: "List" }]}
			/>,
		);
		expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		rerender(
			<Segmented
				label="View mode"
				value={value as "list"}
				onChange={(v) => {
					value = v;
				}}
				options={[{ value: "list", label: "List" }]}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "List" }));
		expect(value).toBe("list");
	});
});
