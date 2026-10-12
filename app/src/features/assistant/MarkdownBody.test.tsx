import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownBody } from "./MarkdownBody";

// The renderer is lazy-loaded; the first dynamic import of react-markdown can
// take a few seconds on a cold vitest transform, so every find waits longer
// than testing-library's 1s default.
const FIND = { timeout: 15000 };

// Renders real markdown through the real component map (react-markdown +
// remark-gfm resolve inside Suspense while the finder waits).
describe("MarkdownBody", () => {
	it("renders headings with document typography", async () => {
		render(
			<MarkdownBody>{"# Session report\n\nIntro paragraph"}</MarkdownBody>,
		);
		const h1 = await screen.findByRole("heading", { level: 1 }, FIND);
		expect(h1).toHaveTextContent("Session report");
		expect(h1.className).toContain("font-semibold");
		expect(screen.getByText("Intro paragraph")).toBeInTheDocument();
	});

	it("renders a GFM table with header cells", async () => {
		render(
			<MarkdownBody>
				{"| Voice | Engine |\n| --- | --- |\n| Atlas | kokoro |"}
			</MarkdownBody>,
		);
		const table = await screen.findByRole("table", {}, FIND);
		expect(
			screen.getByRole("columnheader", { name: "Voice" }),
		).toBeInTheDocument();
		expect(screen.getByRole("cell", { name: "kokoro" })).toBeInTheDocument();
		expect(table.className).toContain("border-collapse");
	});

	it("renders fenced code through the carded CodeBlock (language label)", async () => {
		render(
			<MarkdownBody>{"Run this:\n\n```python\nprint('hi')\n```"}</MarkdownBody>,
		);
		const label = await screen.findByText("python", {}, FIND);
		expect(label.className).toContain("uppercase");
		expect(screen.getByText("print('hi')")).toBeInTheDocument();
	});

	it("renders inline code as an inline pill, not a card", async () => {
		render(<MarkdownBody>{"Use `profile_id` here."}</MarkdownBody>);
		const inline = await screen.findByText("profile_id", {}, FIND);
		expect(inline.tagName).toBe("CODE");
		expect(inline.className).toContain("rounded");
	});

	it("renders links with safe external attributes", async () => {
		render(<MarkdownBody>{"See [docs](https://example.com/x)"}</MarkdownBody>);
		const link = await screen.findByRole("link", { name: "docs" }, FIND);
		expect(link).toHaveAttribute("target", "_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
	});

	it("renders lists with accent markers", async () => {
		render(<MarkdownBody>{"- one\n- two"}</MarkdownBody>);
		const list = await screen.findByRole("list", {}, FIND);
		expect(list.className).toContain("list-disc");
		expect(screen.getByText("one")).toBeInTheDocument();
	});
});
