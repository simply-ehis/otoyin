import {
	ChevronDownIcon as ChevronDown,
	ChevronRightIcon as ChevronRight,
	TrashIcon as Delete,
	PencilIcon as Edit,
	SpeakerXMarkIcon as Mute,
	PauseIcon as Pause,
	PlayIcon as Play,
	SpeakerWaveIcon as Volume,
	WrenchIcon as Wrench,
} from "@heroicons/react/24/outline";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { debug } from "../../lib/utils/debug";

// Markdown rendering is deferred until a message actually needs it.
//
// Both of these were `lazy()` *at module scope*, which means the dynamic
// import starts as soon as AssistantMessage is evaluated — i.e. as soon as the
// Assistant panel chunk loads, even if no message is ever rendered. Measured
// cost at startup: react-markdown + remark-gfm + prism-light + 17 Prism
// grammars ≈ 600 KB of JS and ~10 language files fetched before the first
// paint finished. Now the factories below are called from the render path, so
// nothing is fetched until a code block or markdown body appears.

// Lazy-load markdown renderer + plugins (~150KB) — only needed when messages contain markdown
const loadMarkdown = () =>
	Promise.all([import("react-markdown"), import("remark-gfm")]).then(
		([rm, gfm]) => {
			const ReactMarkdown = rm.default;
			const remarkGfmPlugin = gfm.default;
			function MarkdownWrapper({
				children,
				...props
			}: {
				children: string;
				[key: string]: unknown;
			}) {
				return (
					<ReactMarkdown remarkPlugins={[remarkGfmPlugin]} {...props}>
						{children}
					</ReactMarkdown>
				);
			}
			return { default: MarkdownWrapper };
		},
	);
const MarkdownRenderer = lazy(loadMarkdown);

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
			if (live) setPrism(mod);
		});
		return () => {
			live = false;
		};
	}, [language, isSupported]);

	if (!isSupported) return null;
	return Prism;
}

const loadVscDarkPlusStyle = () =>
	import("react-syntax-highlighter/dist/esm/styles/prism").then(
		(m) => m.vscDarkPlus,
	);

import { CodeConsole } from "@/ui/code-console";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface Msg {
	id: string;
	role:
		| "user"
		| "assistant"
		| "tool_call"
		| "tool_result"
		| "error"
		| "audio_preview"
		| "thinking";
	content: string;
	toolName?: string;
	toolArgs?: Record<string, unknown>;
	toolResult?: string;
	isEditing?: boolean;
	branchPoint?: boolean;
}

type CodeComponentProps = {
	node: unknown;
	inline: boolean;
	className?: string;
	children: React.ReactNode;
	[key: string]: unknown;
};

type PreComponentProps = {
	children: React.ReactNode;
	[key: string]: unknown;
};

type MarkdownComponentType =
	| React.ComponentType<CodeComponentProps>
	| React.ComponentType<PreComponentProps>;

function CodeBlock({ language, code }: { language: string; code: string }) {
	// Fetched only when this block actually renders: the Prism theme sheet and
	// the language grammar both used to load at module evaluation time.
	const [style, setStyle] = useState<Record<
		string,
		React.CSSProperties
	> | null>(null);
	const Prism = useSyntaxHighlighter(language);

	useEffect(() => {
		if (!Prism) return;
		let live = true;
		void loadVscDarkPlusStyle().then((s) => {
			if (live) setStyle(s);
		});
		return () => {
			live = false;
		};
	}, [Prism]);

	const plain = (
		<pre className="bg-sunken p-3 rounded text-sm font-mono overflow-x-auto">
			<code>{code}</code>
		</pre>
	);

	if (!style || !Prism) return plain;

	const Highlighter = Prism as React.ComponentType<{
		language: string;
		style: Record<string, React.CSSProperties>;
		showLineNumbers: boolean;
		wrapLongLines: boolean;
		children: string;
	}>;

	return (
		<Highlighter
			language={language}
			style={style}
			showLineNumbers={false}
			wrapLongLines={true}
		>
			{code}
		</Highlighter>
	);
}

const MARKDOWN_COMPONENTS: Record<string, MarkdownComponentType> = {
	code: ({
		node,
		inline,
		className,
		children,
		...props
	}: CodeComponentProps) => {
		const match = /language-(\w+)/.exec(className || "");
		return !inline && match ? (
			<CodeBlock
				language={match[1]}
				code={String(children).replace(/\n$/, "")}
			/>
		) : (
			<code
				className={cn(
					"bg-secondary px-1.5 py-0.5 rounded text-sm font-mono",
					(props as { className?: string }).className,
				)}
			>
				{children}
			</code>
		);
	},
	pre: ({ children, ...props }: PreComponentProps) => (
		<pre {...props}>{children}</pre>
	),
};

interface AudioPreviewData {
	fileName: string;
	bytes?: number;
	streamUrl?: string;
}

function parseAudioResult(text?: string): AudioPreviewData | null {
	if (!text) {
		return null;
	}
	try {
		const data = JSON.parse(text) as Record<string, unknown>;
		if (data && typeof data.audio_file === "string") {
			return {
				fileName: data.audio_file,
				bytes: typeof data.bytes === "number" ? data.bytes : undefined,
				streamUrl: apiClient.getExportUrl(data.audio_file),
			};
		}
	} catch {
		// Non-JSON tool results are rendered as text.
	}
	return null;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ToolCallBubble({ msg, onEdit }: { msg: Msg; onEdit?: () => void }) {
	const [open] = useState(false);
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2 text-xs text-accent/80 hover:text-accent transition-colors">
				<Wrench className="size-3" />
				<span className="font-medium">{msg.toolName}</span>
				{onEdit && (
					<button
						type="button"
						onClick={onEdit}
						className="ml-auto p-1 hover:bg-accent/10 rounded"
						title="Edit tool call"
						aria-label="Edit tool call"
					>
						<Edit className="size-3" />
					</button>
				)}
			</div>
			{open && msg.toolArgs && (
				<CodeConsole maxHeight="10rem" className="text-xs">
					{JSON.stringify(msg.toolArgs, null, 2)}
				</CodeConsole>
			)}
		</div>
	);
}

function ToolResultBubble({ msg }: { msg: Msg }) {
	const [open, setOpen] = useState(false);
	const audio = useMemo(
		() => parseAudioResult(msg.toolResult),
		[msg.toolResult],
	);
	const [isPlaying, setIsPlaying] = useState(false);
	const [volume, setVolume] = useState(1);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const audioRef = useRef<HTMLAudioElement>(null);

	const togglePlay = useCallback(() => {
		if (!audioRef.current) {
			return;
		}
		if (isPlaying) {
			audioRef.current.pause();
		} else {
			audioRef.current.play().catch((err) => {
				debug.warn("[assistant] audio.play failed:", err);
			});
		}
		setIsPlaying(!isPlaying);
	}, [isPlaying]);

	const handleVolumeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const v = parseFloat(e.target.value);
			setVolume(v);
			if (audioRef.current) {
				audioRef.current.volume = v;
			}
		},
		[],
	);

	const handleTimeUpdate = useCallback(() => {
		if (audioRef.current) {
			setCurrentTime(audioRef.current.currentTime);
		}
	}, []);

	const handleLoadedMetadata = useCallback(() => {
		if (audioRef.current) {
			setDuration(audioRef.current.duration);
		}
	}, []);

	const handleEnded = useCallback(() => setIsPlaying(false), []);

	const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		if (audioRef.current) {
			audioRef.current.currentTime = parseFloat(e.target.value);
		}
	}, []);

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2 text-xs text-success-text/80 hover:text-success-text transition-colors">
				<Wrench className="size-3" />
				{open ? (
					<ChevronDown className="size-3" />
				) : (
					<ChevronRight className="size-3" />
				)}
				<span className="font-medium">
					{audio ? "Audio: " : "Result: "}
					{msg.toolName}
				</span>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="ml-auto p-1 hover:bg-accent/10 rounded"
					aria-label={open ? "Collapse" : "Expand"}
				>
					{open ? (
						<ChevronDown className="size-3" />
					) : (
						<ChevronRight className="size-3" />
					)}
				</button>
			</div>

			{audio?.streamUrl && (
				<div className="flex flex-col gap-1 rounded-lg bg-secondary px-3 py-2">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={togglePlay}
							className="p-1 rounded hover:bg-accent/10"
							aria-label={isPlaying ? "Pause" : "Play"}
						>
							{isPlaying ? (
								<Pause className="size-4" />
							) : (
								<Play className="size-4" />
							)}
						</button>
						<span className="text-xs text-muted-foreground flex-1 truncate">
							{audio.fileName}
						</span>
						{audio.bytes !== undefined && (
							<span className="text-xs text-muted-foreground">
								{formatBytes(audio.bytes)}
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						<input
							type="range"
							min="0"
							max={duration || 100}
							value={currentTime}
							onChange={handleSeek}
							className="flex-1 h-1 appearance-none bg-secondary rounded-full accent-accent"
							aria-label="Playback position"
						/>
						<span className="text-xs text-muted-foreground w-12 text-right">
							{currentTime.toFixed(1)}s / {duration.toFixed(1)}s
						</span>
						<button
							type="button"
							onClick={() => setVolume(volume > 0 ? 0 : 1)}
							className="p-1 rounded hover:bg-accent/10"
							aria-label={volume > 0 ? "Mute" : "Unmute"}
						>
							{volume > 0 ? (
								<Volume className="size-4" />
							) : (
								<Mute className="size-4" />
							)}
						</button>
						<input
							type="range"
							min="0"
							max="1"
							step="0.1"
							value={volume}
							onChange={handleVolumeChange}
							className="w-20 h-1 appearance-none bg-secondary rounded-full accent-accent"
							aria-label="Volume"
						/>
					</div>
					<audio
						ref={audioRef}
						src={audio.streamUrl}
						onTimeUpdate={handleTimeUpdate}
						onLoadedMetadata={handleLoadedMetadata}
						onEnded={handleEnded}
						preload="metadata"
					>
						<track kind="captions" default />
					</audio>
				</div>
			)}

			{open && (
				<CodeConsole maxHeight="10rem" className="text-xs">
					{msg.toolResult || msg.content}
				</CodeConsole>
			)}
		</div>
	);
}

function TextBubble({
	msg,
	onEdit,
	onDelete,
	onBranch,
}: {
	msg: Msg;
	onEdit?: () => void;
	onDelete?: () => void;
	onBranch?: () => void;
}) {
	const isUser = msg.role === "user";
	return (
		<div
			className={cn(
				"rounded-lg px-3 py-2 text-sm max-w-[90%] relative group",
				isUser
					? "bg-accent-muted text-foreground ml-auto"
					: "bg-secondary text-foreground",
			)}
		>
			<div className="flex items-start gap-2">
				<Suspense
					fallback={
						<span className="text-muted-foreground text-xs">Loading...</span>
					}
				>
					<MarkdownRenderer components={MARKDOWN_COMPONENTS}>
						{msg.content}
					</MarkdownRenderer>
				</Suspense>
			</div>
			<div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
				{onEdit && (
					<button
						type="button"
						onClick={onEdit}
						className="p-1 rounded hover:bg-accent/10 text-muted-foreground"
						title="Edit"
						aria-label="Edit message"
					>
						<Edit className="size-3" />
					</button>
				)}
				{onDelete && (
					<button
						type="button"
						onClick={onDelete}
						className="p-1 rounded hover:bg-destructive/10 text-muted-foreground"
						title="Delete"
						aria-label="Delete message"
					>
						<Delete className="size-3" />
					</button>
				)}
				{onBranch && (
					<button
						type="button"
						onClick={onBranch}
						className="p-1 rounded hover:bg-accent/10 text-muted-foreground"
						title="Branch from here"
						aria-label="Branch from here"
					>
						<ArrowPathIcon className="size-3" />
					</button>
				)}
			</div>
		</div>
	);
}

function AudioPreviewBubble({ msg }: { msg: Msg }) {
	const audio = useMemo(() => parseAudioResult(msg.content), [msg.content]);
	const [isPlaying, setIsPlaying] = useState(false);
	const [volume, setVolume] = useState(1);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const audioRef = useRef<HTMLAudioElement>(null);

	const togglePlay = useCallback(() => {
		if (!audioRef.current) {
			return;
		}
		if (isPlaying) {
			audioRef.current.pause();
		} else {
			audioRef.current.play().catch((err) => {
				debug.warn("[assistant] audio.play failed:", err);
			});
		}
		setIsPlaying(!isPlaying);
	}, [isPlaying]);

	const handleVolumeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const v = parseFloat(e.target.value);
			setVolume(v);
			if (audioRef.current) {
				audioRef.current.volume = v;
			}
		},
		[],
	);

	const handleTimeUpdate = useCallback(() => {
		if (audioRef.current) {
			setCurrentTime(audioRef.current.currentTime);
		}
	}, []);
	const handleLoadedMetadata = useCallback(() => {
		if (audioRef.current) {
			setDuration(audioRef.current.duration);
		}
	}, []);
	const handleEnded = useCallback(() => setIsPlaying(false), []);
	const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		if (audioRef.current) {
			audioRef.current.currentTime = parseFloat(e.target.value);
		}
	}, []);

	if (!audio || !audio.streamUrl) {
		return null;
	}

	return (
		<div className="flex flex-col gap-1 rounded-lg bg-secondary px-3 py-2">
			<div className="flex items-center gap-2 text-xs">
				<Sparkles className="size-3 text-accent" />
				<span className="font-medium text-accent">Streaming audio preview</span>
				<span className="text-muted-foreground">
					{audio.fileName} · {formatBytes(audio.bytes || 0)}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={togglePlay}
					className="p-1 rounded hover:bg-accent/10"
					aria-label={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? (
						<Pause className="size-4" />
					) : (
						<Play className="size-4" />
					)}
				</button>
				<input
					type="range"
					min="0"
					max={duration || 100}
					value={currentTime}
					onChange={handleSeek}
					className="flex-1 h-1 appearance-none bg-secondary rounded-full accent-accent"
					aria-label="Playback position"
				/>
				<span className="text-xs text-muted-foreground w-12 text-right">
					{currentTime.toFixed(1)}s / {duration.toFixed(1)}s
				</span>
				<button
					type="button"
					onClick={() => setVolume(volume > 0 ? 0 : 1)}
					className="p-1 rounded hover:bg-accent/10"
					aria-label={volume > 0 ? "Mute" : "Unmute"}
				>
					{volume > 0 ? (
						<Volume className="size-4" />
					) : (
						<Mute className="size-4" />
					)}
				</button>
				<input
					type="range"
					min="0"
					max="1"
					step="0.1"
					value={volume}
					onChange={handleVolumeChange}
					className="w-20 h-1 appearance-none bg-secondary rounded-full accent-accent"
					aria-label="Volume"
				/>
			</div>
			<audio
				ref={audioRef}
				src={audio.streamUrl}
				onTimeUpdate={handleTimeUpdate}
				onLoadedMetadata={handleLoadedMetadata}
				onEnded={handleEnded}
				preload="metadata"
			>
				<track kind="captions" default />
			</audio>
		</div>
	);
}

import {
	ArrowPathIcon,
	SparklesIcon as Sparkles,
} from "@heroicons/react/24/outline";
import { memo } from "react";

export const AssistantMessage = memo(function AssistantMessage({
	msg,
	onEditMessage,
	onDeleteMessage,
	onBranchMessage,
}: {
	msg: Msg;
	onEditMessage?: (id: string) => void;
	onDeleteMessage?: (id: string) => void;
	onBranchMessage?: (id: string) => void;
}) {
	if (msg.role === "tool_call") {
		return (
			<ToolCallBubble
				msg={msg}
				onEdit={onEditMessage ? () => onEditMessage(msg.id) : undefined}
			/>
		);
	}
	if (msg.role === "tool_result") {
		return <ToolResultBubble msg={msg} />;
	}
	if (msg.role === "error") {
		return (
			<div className="rounded-lg bg-danger-soft border border-destructive/20 px-3 py-2">
				<p className="text-xs text-destructive">{msg.content}</p>
			</div>
		);
	}
	if (msg.role === "audio_preview") {
		return <AudioPreviewBubble msg={msg} />;
	}
	if (msg.role === "thinking") {
		return (
			<div className="rounded-lg bg-secondary border border-dashed border-border px-3 py-2">
				<p className="text-xs uppercase tracking-wide text-muted-foreground/70 mb-1">
					Reasoning
				</p>
				<p className="text-xs text-muted-foreground/90 whitespace-pre-wrap leading-relaxed">
					{msg.content}
				</p>
			</div>
		);
	}
	return (
		<TextBubble
			msg={msg}
			onEdit={onEditMessage ? () => onEditMessage(msg.id) : undefined}
			onDelete={onDeleteMessage ? () => onDeleteMessage(msg.id) : undefined}
			onBranch={onBranchMessage ? () => onBranchMessage(msg.id) : undefined}
		/>
	);
});
