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

describe("CodeConsole", () => {
	it("renders children", () => {
		render(<CodeConsole>hello world</CodeConsole>);
		expect(screen.getByText("hello world")).toBeInTheDocument();
	});

	it("applies code variant classes by default", () => {
		const { container } = render(<CodeConsole>test</CodeConsole>);
		const div = container.firstElementChild as HTMLElement;
		expect(div.className).toContain("bg-muted/50");
		expect(div.className).toContain("text-muted-foreground");
	});

	it("applies terminal variant classes", () => {
		const { container } = render(
			<CodeConsole variant="terminal">test</CodeConsole>,
		);
		const div = container.firstElementChild as HTMLElement;
		expect(div.className).toContain("var(--color-terminal-bg)");
		expect(div.className).toContain("var(--color-terminal-fg)");
	});

	it("applies border when showBorder is true", () => {
		const { container } = render(<CodeConsole showBorder>test</CodeConsole>);
		const div = container.firstElementChild as HTMLElement;
		expect(div.className).toContain("border");
	});

	it("does not apply border by default", () => {
		const { container } = render(<CodeConsole>test</CodeConsole>);
		const div = container.firstElementChild as HTMLElement;
		const classes = div.className.split(/\s+/);
		expect(classes).not.toContain("border");
	});

	it("sets title attribute when provided", () => {
		render(<CodeConsole title="Server Output">test</CodeConsole>);
		expect(screen.getByText("test")).toHaveAttribute("title", "Server Output");
	});

	it("applies custom maxHeight", () => {
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
		expect(div).toHaveTextContent("line 1 line 2");
	});
});

describe("Terminal tokens", () => {
	it("TerminalError renders with error color", () => {
		render(<TerminalError>error msg</TerminalError>);
		const span = screen.getByText("error msg");
		expect(span).toBeInTheDocument();
		expect(span.className).toContain("var(--color-terminal-error)");
	});

	it("TerminalInfo renders with info color", () => {
		render(<TerminalInfo>info msg</TerminalInfo>);
		const span = screen.getByText("info msg");
		expect(span).toBeInTheDocument();
		expect(span.className).toContain("var(--color-terminal-info)");
	});

	it("TerminalString renders with string color", () => {
		render(<TerminalString>string msg</TerminalString>);
		const span = screen.getByText("string msg");
		expect(span).toBeInTheDocument();
		expect(span.className).toContain("var(--color-terminal-string)");
	});

	it("TerminalComment renders with comment color", () => {
		render(<TerminalComment>comment msg</TerminalComment>);
		const span = screen.getByText("comment msg");
		expect(span).toBeInTheDocument();
		expect(span.className).toContain("var(--color-terminal-comment)");
	});

	it("TerminalSuccess renders with success color", () => {
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

describe("CodeConsole with token children", () => {
	it("renders nested tokens inside console", () => {
		render(
			<CodeConsole variant="terminal">
				<TerminalError>Error:</TerminalError> something went wrong
			</CodeConsole>,
		);
		expect(screen.getByText("Error:")).toBeInTheDocument();
		expect(screen.getByText("something went wrong")).toBeInTheDocument();
	});

	it("renders multi-line content with pre-wrap", () => {
		const { container } = render(
			<CodeConsole variant="terminal">line 1{"\n"}line 2</CodeConsole>,
		);
		const div = container.firstElementChild as HTMLElement;
		expect(div.className).toContain("whitespace-pre-wrap");
	});
});
