import { lazy, Suspense } from "react";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils/cn";
import { CodeBlock } from "./CodeBlock";

// Markdown rendering is deferred until a message actually needs it.
//
// The factory is called from the render path, so react-markdown + remark-gfm
// (~150KB) are never fetched until a message with markdown appears.

const proseText = "first:mt-0 last:mb-0";

/** Typography for markdown rendered inside a chat bubble. */
const components: Components = {
	h1: ({ children }) => (
		<h1
			className={`mt-4 mb-2 border-b border-border/60 pb-1.5 text-lg font-semibold tracking-tight ${proseText}`}
		>
			{children}
		</h1>
	),
	h2: ({ children }) => (
		<h2
			className={`mt-4 mb-1.5 text-base font-semibold tracking-tight ${proseText}`}
		>
			{children}
		</h2>
	),
	h3: ({ children }) => (
		<h3 className={`mt-3 mb-1 text-sm font-semibold ${proseText}`}>
			{children}
		</h3>
	),
	h4: ({ children }) => (
		<h4 className={`mt-2.5 mb-1 text-sm font-medium ${proseText}`}>
			{children}
		</h4>
	),
	h5: ({ children }) => (
		<h5
			className={`mt-2.5 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${proseText}`}
		>
			{children}
		</h5>
	),
	h6: ({ children }) => (
		<h6
			className={`mt-2.5 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${proseText}`}
		>
			{children}
		</h6>
	),
	p: ({ children }) => (
		<p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>
	),
	a: ({ href, title, children }) => (
		<a
			href={href}
			title={title}
			target="_blank"
			rel="noopener noreferrer"
			className="font-medium text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
		>
			{children}
		</a>
	),
	strong: ({ children }) => (
		<strong className="font-semibold">{children}</strong>
	),
	em: ({ children }) => <em className="italic">{children}</em>,
	del: ({ children }) => (
		<del className="text-muted-foreground line-through">{children}</del>
	),
	ul: ({ children }) => (
		<ul className="my-2 list-disc space-y-1 pl-5 marker:text-accent">
			{children}
		</ul>
	),
	ol: ({ children }) => (
		<ol className="my-2 list-decimal space-y-1 pl-5 marker:text-accent marker:font-medium">
			{children}
		</ol>
	),
	li: ({ children }) => (
		<li className="leading-relaxed [&>p]:my-1">{children}</li>
	),
	blockquote: ({ children }) => (
		<blockquote className="my-2 rounded-r-md border-l-2 border-accent/60 bg-accent-muted/50 px-3 py-2 italic text-foreground/80">
			{children}
		</blockquote>
	),
	hr: () => <hr className="my-3 border-border" />,
	img: ({ src, alt }) => (
		<img
			src={src}
			alt={alt ?? ""}
			loading="lazy"
			className="my-2 max-w-full rounded-lg border border-border"
		/>
	),
	// GFM task-list checkboxes are display-only inside chat history.
	input: ({ node: _node, ...props }) => (
		<input
			{...props}
			readOnly
			disabled
			className="mr-1.5 size-3.5 accent-accent"
		/>
	),
	table: ({ children }) => (
		<div className="my-2 overflow-x-auto rounded-lg border border-border">
			<table className="w-full border-collapse text-xs">{children}</table>
		</div>
	),
	thead: ({ children }) => <thead className="bg-sunken/80">{children}</thead>,
	tr: ({ children }) => (
		<tr className="transition-colors hover:bg-accent-muted/40">{children}</tr>
	),
	th: ({ children, align }) => (
		<th
			className={cn(
				"border-b border-border px-2.5 py-1.5 font-semibold",
				align === "center"
					? "text-center"
					: align === "right"
						? "text-right"
						: "text-left",
			)}
		>
			{children}
		</th>
	),
	td: ({ children, align }) => (
		<td
			className={cn(
				"border-b border-border/40 px-2.5 py-1.5 last:border-b-0",
				align === "center"
					? "text-center"
					: align === "right"
						? "text-right"
						: "text-left",
			)}
		>
			{children}
		</td>
	),
	// Block code is handled here (not in `code`): react-markdown v10 no longer
	// passes an `inline` flag, so `pre` is the only reliable block boundary.
	// The child is the `code` override's output, whose props carry the raw
	// source string and the `language-*` class from the fence.
	pre: ({ children }) => {
		const child =
			typeof children === "object" &&
			children !== null &&
			"props" in children &&
			children.props &&
			typeof children.props === "object"
				? (children as { props: { children?: unknown; className?: string } })
				: null;
		const raw = child?.props.children;
		if (typeof raw === "string") {
			const lang =
				/language-(\w+)/.exec(child?.props.className ?? "")?.[1] ?? "";
			return <CodeBlock language={lang} code={raw.replace(/\n$/, "")} />;
		}
		return (
			<div className="my-2.5 overflow-hidden rounded-lg border border-border bg-sunken">
				<pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">
					{children}
				</pre>
			</div>
		);
	},
	// Inline code — a fenced block's `code` child never mounts (pre replaces
	// it), so everything that reaches here is inline.
	code: ({ className, children, ...props }) => (
		<code
			{...props}
			className={cn(
				"rounded border border-border/50 bg-background/70 px-1.5 py-0.5 font-mono text-[0.85em] break-words",
				className?.includes("language-") ? "border-transparent" : undefined,
				className,
			)}
		>
			{children}
		</code>
	),
};

const loadMarkdown = () =>
	Promise.all([import("react-markdown"), import("remark-gfm")]).then(
		([rm, gfm]) => {
			const ReactMarkdown = rm.default;
			const remarkGfmPlugin = gfm.default;
			function MarkdownWrapper({ children }: { children: string }) {
				return (
					<ReactMarkdown
						remarkPlugins={[remarkGfmPlugin]}
						components={components}
					>
						{children}
					</ReactMarkdown>
				);
			}
			return { default: MarkdownWrapper };
		},
	);
const Markdown = lazy(loadMarkdown);

function MarkdownSkeleton() {
	return (
		<output className="block space-y-2 py-1" aria-label="Rendering markdown">
			<span className="block h-3 w-3/4 animate-pulse rounded bg-secondary" />
			<span className="block h-3 w-1/2 animate-pulse rounded bg-secondary" />
		</output>
	);
}

/**
 * Beautiful markdown body for chat messages: document-grade typography,
 * carded code blocks with copy, striped tables, rose blockquotes.
 */
export function MarkdownBody({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<div className={cn("min-w-0 w-full break-words", className)}>
			<Suspense fallback={<MarkdownSkeleton />}>
				<Markdown>{children}</Markdown>
			</Suspense>
		</div>
	);
}
