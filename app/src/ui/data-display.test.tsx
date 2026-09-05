/**
 * Data-display primitives tests — render + interaction floor (14).
 *
 * Encodes desktop-ui-grids-layout + feedback rules: real table semantics
 * with numeric alignment, measured progress with accessible values,
 * labeled code regions with working copy, honest loading output.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppLoadingScreen, PageLoadingFallback } from "./AppLoadingScreen";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "./card";
import { CodeConsole } from "./code-console";
import { Progress } from "./progress";
import { ScrollArea } from "./scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "./table";

describe("Table", () => {
	function renderTable() {
		return render(
			<Table>
				<TableHead>
					<TableRow>
						<TableHeaderCell>Voice</TableHeaderCell>
						<TableHeaderCell numeric>Length</TableHeaderCell>
					</TableRow>
				</TableHead>
				<TableBody>
					<TableRow>
						<TableCell>Ada</TableCell>
						<TableCell numeric>4.2s</TableCell>
					</TableRow>
				</TableBody>
			</Table>,
		);
	}

	it("keeps real table semantics and header association", () => {
		renderTable();
		expect(screen.getByRole("table")).toBeInTheDocument();
		expect(
			screen.getByRole("columnheader", { name: "Voice" }),
		).toBeInTheDocument();
		expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument();
	});

	it("right-aligns numeric columns", () => {
		renderTable();
		expect(
			screen.getByRole("columnheader", { name: "Length" }).className,
		).toContain("text-right");
		expect(screen.getByRole("cell", { name: "4.2s" }).className).toContain(
			"text-right",
		);
		expect(screen.getByRole("cell", { name: "4.2s" })).toHaveAttribute(
			"title",
			"4.2s",
		);
	});
});

describe("Card", () => {
	it("composes header, title, body, and footer", () => {
		render(
			<Card>
				<CardHeader>
					<CardTitle>Kokoro 82M</CardTitle>
				</CardHeader>
				<CardBody>Multilingual TTS</CardBody>
				<CardFooter>
					<button type="button">Install</button>
				</CardFooter>
			</Card>,
		);
		expect(
			screen.getByRole("heading", { name: "Kokoro 82M" }),
		).toBeInTheDocument();
		expect(screen.getByText("Multilingual TTS")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
	});
});

describe("Progress", () => {
	it("exposes measured value to assistive tech", () => {
		render(<Progress value={50} label="Model download" />);
		const bar = screen.getByRole("progressbar", { name: "Model download" });
		expect(bar).toHaveAttribute("aria-valuenow", "50");
		expect(bar).toHaveAttribute("aria-valuemin", "0");
		expect(bar).toHaveAttribute("aria-valuemax", "100");
	});

	it("clamps out-of-range values in the indicator", () => {
		const { rerender } = render(<Progress value={250} label="OVER" />);
		expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({
			transform: "translateX(-0%)",
		});
		rerender(<Progress value={-10} label="UNDER" />);
		expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({
			transform: "translateX(-100%)",
		});
	});
});

describe("ScrollArea", () => {
	it("renders children inside a scrollable viewport", () => {
		render(
			<ScrollArea>
				<p>Line one</p>
				<p>Line two</p>
			</ScrollArea>,
		);
		expect(screen.getByText("Line one")).toBeInTheDocument();
		expect(screen.getByText("Line two")).toBeInTheDocument();
	});
});

describe("CodeConsole", () => {
	it("labels the region and exposes text for selection", () => {
		render(<CodeConsole language="json">{'{"a": 1}'}</CodeConsole>);
		expect(
			screen.getByRole("region", { name: "json snippet" }),
		).toHaveTextContent('{"a": 1}');
		expect(
			screen.getByRole("button", { name: "Copy snippet" }),
		).toBeInTheDocument();
	});

	it("copies via clipboard when available and confirms", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		render(<CodeConsole>{"hello"}</CodeConsole>);
		await user.click(screen.getByRole("button", { name: "Copy snippet" }));
		expect(writeText).toHaveBeenCalledWith("hello");
		expect(
			await screen.findByRole("button", { name: "Copied" }),
		).toBeInTheDocument();
	});

	it("survives without a clipboard (select-and-copy fallback)", async () => {
		const user = userEvent.setup();
		Object.defineProperty(window.navigator, "clipboard", {
			value: undefined,
			configurable: true,
		});
		render(<CodeConsole>{"hello"}</CodeConsole>);
		await user.click(screen.getByRole("button", { name: "Copy snippet" }));
		expect(screen.getByText("hello")).toBeInTheDocument();
	});
});

describe("AppLoadingScreen", () => {
	it("announces itself with the default label", () => {
		render(<AppLoadingScreen />);
		expect(
			screen.getByRole("status", { name: "Loading Otoyin" }),
		).toBeInTheDocument();
	});

	it("accepts a custom label", () => {
		render(<AppLoadingScreen label="Loading voices" />);
		expect(
			screen.getByRole("status", { name: "Loading voices" }),
		).toBeInTheDocument();
	});

	it("PageLoadingFallback hides skeleton noise from assistive tech", () => {
		const { container } = render(<PageLoadingFallback />);
		expect(
			container.querySelectorAll('[aria-hidden="true"]').length,
		).toBeGreaterThan(0);
		expect(container.querySelector('[role="status"]')).toBeNull();
	});
});
