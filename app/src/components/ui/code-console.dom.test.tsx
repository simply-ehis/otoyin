/**
 * Full DOM rendering test for CodeConsole.
 * This test validates the React 18/19 vitest fix works correctly
 * by actually rendering components into a jsdom DOM.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	CodeConsole,
	TerminalComment,
	TerminalError,
	TerminalInfo,
	TerminalString,
	TerminalSuccess,
} from "./code-console";

describe("CodeConsole DOM rendering", () => {
	it("renders children into the DOM", () => {
		render(<CodeConsole>hello world</CodeConsole>);
		expect(screen.getByText("hello world")).toBeInTheDocument();
	});

	it("renders with terminal variant classes", () => {
		const { container } = render(
			<CodeConsole variant="terminal">test</CodeConsole>,
		);
		const div = container.firstElementChild as HTMLElement;
		expect(div).toBeTruthy();
		expect(div.className).toContain("var(--color-terminal-bg)");
		expect(div.className).toContain("var(--color-terminal-fg)");
		expect(div.className).toContain("font-mono");
	});

	it("renders with code variant classes", () => {
		const { container } = render(<CodeConsole>test</CodeConsole>);
		const div = container.firstElementChild as HTMLElement;
		expect(div.className).toContain("bg-muted/50");
		expect(div.className).toContain("text-muted-foreground");
	});

	it("applies border when showBorder is true", () => {
		const { container } = render(<CodeConsole showBorder>test</CodeConsole>);
		const div = container.firstElementChild as HTMLElement;
		expect(div.className).toContain("border");
	});

	it("does not apply border by default", () => {
		const { container } = render(<CodeConsole>test</CodeConsole>);
		const div = container.firstElementChild as HTMLElement;
		// "border" only as a standalone class, not as part of border-X
		const classes = div.className.split(/\s+/);
		expect(classes).not.toContain("border");
	});

	it("sets title attribute", () => {
		render(<CodeConsole title="Server Output">test</CodeConsole>);
		expect(screen.getByText("test")).toHaveAttribute("title", "Server Output");
	});

	it("applies custom maxHeight style", () => {
		const { container } = render(
			<CodeConsole maxHeight="200px">test</CodeConsole>,
		);
		const div = container.firstElementChild as HTMLElement;
		expect(div.style.maxHeight).toBe("200px");
	});

	it("applies custom className", () => {
		const { container } = render(
			<CodeConsole className="my-custom-class">test</CodeConsole>,
		);
		const div = container.firstElementChild as HTMLElement;
		expect(div.className).toContain("my-custom-class");
	});

	it("renders multiline content with pre-wrap", () => {
		const { container } = render(<CodeConsole>line 1{"\n"}line 2</CodeConsole>);
		const div = container.firstElementChild as HTMLElement;
		expect(div.className).toContain("whitespace-pre-wrap");
		// jsdom normalizes whitespace in textContent, so just check both fragments exist
		expect(div).toHaveTextContent("line 1 line 2");
	});
});

describe("Terminal token DOM rendering", () => {
	it("TerminalError renders with correct color", () => {
		render(<TerminalError>error msg</TerminalError>);
		const span = screen.getByText("error msg");
		expect(span).toBeInTheDocument();
		expect(span.tagName).toBe("SPAN");
		expect(span.className).toContain("var(--color-terminal-error)");
	});

	it("TerminalInfo renders with correct color", () => {
		render(<TerminalInfo>info msg</TerminalInfo>);
		const span = screen.getByText("info msg");
		expect(span).toBeInTheDocument();
		expect(span.className).toContain("var(--color-terminal-info)");
	});

	it("TerminalString renders with correct color", () => {
		render(<TerminalString>string msg</TerminalString>);
		const span = screen.getByText("string msg");
		expect(span).toBeInTheDocument();
		expect(span.className).toContain("var(--color-terminal-string)");
	});

	it("TerminalComment renders with correct color", () => {
		render(<TerminalComment>comment msg</TerminalComment>);
		const span = screen.getByText("comment msg");
		expect(span).toBeInTheDocument();
		expect(span.className).toContain("var(--color-terminal-comment)");
	});

	it("TerminalSuccess renders with correct color", () => {
		render(<TerminalSuccess>success msg</TerminalSuccess>);
		const span = screen.getByText("success msg");
		expect(span).toBeInTheDocument();
		expect(span.className).toContain("var(--color-terminal-success)");
	});

	it("TerminalError accepts custom className", () => {
		render(<TerminalError className="text-lg">msg</TerminalError>);
		const span = screen.getByText("msg");
		expect(span.className).toContain("text-lg");
		expect(span.className).toContain("var(--color-terminal-error)");
	});
});

describe("CodeConsole with nested tokens in DOM", () => {
	it("renders nested token elements inside console", () => {
		render(
			<CodeConsole variant="terminal">
				<TerminalError>Error:</TerminalError> something went wrong
			</CodeConsole>,
		);
		const errorSpan = screen.getByText("Error:");
		expect(errorSpan).toBeInTheDocument();
		expect(errorSpan.className).toContain("var(--color-terminal-error)");

		// Both fragments render inside the console
		expect(screen.getByText("Error:")).toBeInTheDocument();
		expect(screen.getByText("something went wrong")).toBeInTheDocument();
	});

	it("renders multiple token types in one console", () => {
		render(
			<CodeConsole variant="terminal">
				<TerminalInfo>INFO</TerminalInfo>{" "}
				<TerminalString>"loaded"</TerminalString>{" "}
				<TerminalSuccess>OK</TerminalSuccess>
			</CodeConsole>,
		);
		expect(screen.getByText("INFO")).toBeInTheDocument();
		expect(screen.getByText('"loaded"')).toBeInTheDocument();
		expect(screen.getByText("OK")).toBeInTheDocument();
		// All three should be inside the same container
		const consoleDiv = screen.getByText("INFO").closest(".font-mono");
		expect(consoleDiv).toContainElement(screen.getByText('"loaded"'));
		expect(consoleDiv).toContainElement(screen.getByText("OK"));
	});
});
