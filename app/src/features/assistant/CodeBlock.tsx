import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

// Lazy-load the Light highlighter with only the languages assistants emit.
// The full Prism bundle ships every language (~600KB+); this stays ~200KB.
// Unregistered languages fall back to the plain <pre> block (never a crash).
const HIGHLIGHT_LANGUAGE_LOADERS: Record<
	string,
	() => Promise<{ default: unknown }>
> = {
	markup: () =>
		import("react-syntax-highlighter/dist/esm/languages/prism/markup"),
	css: () => import("react-syntax-highlighter/dist/esm/languages/prism/css"),
	clike: () =>
		import("react-syntax-highlighter/dist/esm/languages/prism/clike"),
	javascript: () =>
		import("react-syntax-highlighter/dist/esm/languages/prism/javascript"),
	typescript: () =>
		import("react-syntax-highlighter/dist/esm/languages/prism/typescript"),
	python: () =>
		import("react-syntax-highlighter/dist/esm/languages/prism/python"),
	bash: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
	json: () => import("react-syntax-highlighter/dist/esm/languages/prism/json"),
	yaml: () => import("react-syntax-highlighter/dist/esm/languages/prism/yaml"),
	markdown: () =>
		import("react-syntax-highlighter/dist/esm/languages/prism/markdown"),
	rust: () => import("react-syntax-highlighter/dist/esm/languages/prism/rust"),
	sql: () => import("react-syntax-highlighter/dist/esm/languages/prism/sql"),
	powershell: () =>
		import("react-syntax-highlighter/dist/esm/languages/prism/powershell"),
	java: () => import("react-syntax-highlighter/dist/esm/languages/prism/java"),
	go: () => import("react-syntax-highlighter/dist/esm/languages/prism/go"),
	c: () => import("react-syntax-highlighter/dist/esm/languages/prism/c"),
	cpp: () => import("react-syntax-highlighter/dist/esm/languages/prism/cpp"),
};
const HIGHLIGHT_LANGUAGES = new Set(Object.keys(HIGHLIGHT_LANGUAGE_LOADERS));

// Only the grammars actually asked for are fetched, and only once.
const loadedGrammars = new Map<string, Promise<unknown>>();
function loadGrammar(name: string): Promise<unknown> {
	let p = loadedGrammars.get(name);
	if (!p) {
		p = HIGHLIGHT_LANGUAGE_LOADERS[name]().then((m) => m.default);
		loadedGrammars.set(name, p);
	}
	return p;
}

const highlighterCache = new Map<string, Promise<unknown>>();
function loadHighlighter(language: string): Promise<unknown> {
	let p = highlighterCache.get(language);
	if (!p) {
		p = Promise.all([
			import("react-syntax-highlighter/dist/esm/prism-light"),
			loadGrammar(language),
		]).then(([light, def]) => {
			const { PrismLight } = light;
			// Safe to re-register: Prism overwrites by name.
			PrismLight.registerLanguage(language, def);
			return PrismLight;
		});
		highlighterCache.set(language, p);
	}
	return p;
}

/**
 * Prism highlighter for one language, fetched on demand.
 *
 * Returns null (and fetches nothing) for languages we have no grammar for, so
 * the caller can render its plain <pre> fallback.
 */
function useSyntaxHighlighter(language: string): unknown | null {
	const isSupported = HIGHLIGHT_LANGUAGES.has(language);
	const [Prism, setPrism] = useState<unknown>(null);

	useEffect(() => {
		if (!isSupported) {
			setPrism(null);
			return;
		}
		let live = true;
		void loadHighlighter(language).then((mod) => {
			if (live) {
				setPrism(mod);
			}
		});
		return () => {
			live = false;
		};
	}, [language, isSupported]);

	if (!isSupported) {
		return null;
	}
	return Prism;
}

const loadVscDarkPlusStyle = () =>
	import("react-syntax-highlighter/dist/esm/styles/prism").then(
		(m) => m.vscDarkPlus,
	);

function CopyButton({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);
	const resetTimer = useRef<number | undefined>(undefined);

	useEffect(
		() => () => {
			if (resetTimer.current) {
				window.clearTimeout(resetTimer.current);
			}
		},
		[],
	);

	const onCopy = () => {
		void navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			if (resetTimer.current) {
				window.clearTimeout(resetTimer.current);
			}
			resetTimer.current = window.setTimeout(() => setCopied(false), 1500);
		});
	};

	return (
		<button
			type="button"
			onClick={onCopy}
			title={copied ? "Copied" : "Copy code"}
			aria-label={copied ? "Code copied" : "Copy code"}
			className={cn(
				"rounded p-1 transition-colors",
				copied
					? "text-success-text"
					: "text-muted-foreground hover:bg-secondary hover:text-foreground",
			)}
		>
			{copied ? (
				<CheckIcon className="size-3.5 animate-in fade-in zoom-in-90" />
			) : (
				<ClipboardDocumentIcon className="size-3.5" />
			)}
		</button>
	);
}

/**
 * One fenced code block: card chrome (language label + copy) around a Prism
 * highlight, or a plain pre when the grammar is unavailable.
 */
export function CodeBlock({
	language,
	code,
}: {
	language: string;
	code: string;
}) {
	// Fetched only when this block actually renders: the Prism theme sheet and
	// the language grammar both used to load at module evaluation time.
	const [style, setStyle] = useState<Record<
		string,
		React.CSSProperties
	> | null>(null);
	const Prism = useSyntaxHighlighter(language);

	useEffect(() => {
		if (!Prism) {
			return;
		}
		let live = true;
		void loadVscDarkPlusStyle().then((s) => {
			if (live) {
				setStyle(s);
			}
		});
		return () => {
			live = false;
		};
	}, [Prism]);

	const plain = (
		<pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">
			<code>{code}</code>
		</pre>
	);

	const header = (
		<div className="flex items-center justify-between border-b border-border bg-background/60 px-3 py-1.5">
			<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{language || "code"}
			</span>
			<CopyButton code={code} />
		</div>
	);

	if (!style || !Prism) {
		return (
			<div className="my-2.5 overflow-hidden rounded-lg border border-border bg-sunken">
				{header}
				{plain}
			</div>
		);
	}

	const Highlighter = Prism as React.ComponentType<{
		language: string;
		style: Record<string, React.CSSProperties>;
		showLineNumbers: boolean;
		wrapLongLines: boolean;
		customStyle: React.CSSProperties;
		children: string;
	}>;

	return (
		<div className="my-2.5 overflow-hidden rounded-lg border border-border">
			{header}
			<Highlighter
				language={language}
				style={style}
				showLineNumbers={false}
				wrapLongLines={true}
				customStyle={{
					margin: 0,
					borderRadius: 0,
					padding: "0.75rem",
					fontSize: "13px",
					lineHeight: "1.6",
				}}
			>
				{code}
			</Highlighter>
		</div>
	);
}
