import {
	BoltIcon,
	ClockIcon,
	Cog6ToothIcon,
	CommandLineIcon,
	GlobeAltIcon,
	InformationCircleIcon,
	MagnifyingGlassIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	PlayIcon,
	ShoppingBagIcon,
	SparklesIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

interface Command {
	id: string;
	label: string;
	category: string;
	icon: React.ReactNode;
	action: () => void;
	shortcut?: string;
}

export function CommandPalette({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();

	const commands: Command[] = [
		{
			id: "generate",
			label: "Generate speech",
			category: "Voice",
			icon: <SparklesIcon className="size-4" />,
			action: () => navigate({ to: "/" }),
		},
		{
			id: "voices",
			label: "Voice profiles",
			category: "Voice",
			icon: <MicrophoneIcon className="size-4" />,
			action: () => navigate({ to: "/voices" }),
		},
		{
			id: "models",
			label: "Download models",
			category: "Setup",
			icon: <GlobeAltIcon className="size-4" />,
			action: () => navigate({ to: "/models" }),
		},
		{
			id: "effects",
			label: "Effects & plugins",
			category: "Audio Studio",
			icon: <BoltIcon className="size-4" />,
			action: () => navigate({ to: "/effects" }),
		},
		{
			id: "mixer",
			label: "Mixer",
			category: "Audio Studio",
			icon: <MusicalNoteIcon className="size-4" />,
			action: () => navigate({ to: "/workspace/mixer" }),
		},
		{
			id: "stories",
			label: "Stories",
			category: "Long-form",
			icon: <PlayIcon className="size-4" />,
			action: () => navigate({ to: "/stories" }),
		},
		{
			id: "conversation",
			label: "Conversation mode",
			category: "Long-form",
			icon: <MicrophoneIcon className="size-4" />,
			action: () => navigate({ to: "/workspace/conversation" }),
		},
		{
			id: "settings",
			label: "Settings",
			category: "General",
			icon: <Cog6ToothIcon className="size-4" />,
			action: () => navigate({ to: "/settings" }),
		},
		{
			id: "shortcuts",
			label: "Keyboard shortcuts",
			category: "General",
			icon: <CommandLineIcon className="size-4" />,
			action: () => navigate({ to: "/settings/shortcuts" }),
		},
		{
			id: "store",
			label: "Marketplace",
			category: "General",
			icon: <ShoppingBagIcon className="size-4" />,
			action: () => navigate({ to: "/store" }),
		},
		{
			id: "history",
			label: "Generation history",
			category: "Voice",
			icon: <ClockIcon className="size-4" />,
			action: () => navigate({ to: "/history" }),
		},
		{
			id: "about",
			label: "About",
			category: "General",
			icon: <InformationCircleIcon className="size-4" />,
			action: () => navigate({ to: "/settings/about" }),
		},
		{
			id: "help",
			label: "Help center",
			category: "General",
			icon: <MagnifyingGlassIcon className="size-4" />,
			shortcut: "F1",
			action: () => {
				onClose();
				window.dispatchEvent(new CustomEvent("open-help-center"));
			},
		},
	];

	const filtered = query
		? commands.filter(
				(c) =>
					c.label.toLowerCase().includes(query.toLowerCase()) ||
					c.category.toLowerCase().includes(query.toLowerCase()),
			)
		: commands;

	useEffect(() => {
		if (!open) {
			return;
		}
		const timer = setTimeout(() => {
			inputRef.current?.focus();
		}, 50);
		const onPointerDown = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Command palette"
			className="fixed inset-0 z-50 flex items-start justify-center pt-16 "
			style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
		>
			<div
				ref={containerRef}
				className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 mt-2"
			>
				<div className="p-3 border-b border-border">
					<div className="relative">
						<MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
						<input
							ref={inputRef}
							type="text"
							placeholder="Type a command or search�"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="w-full pl-10 pr-4 py-2 bg-background rounded-md border border-input focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
				</div>

				<div className="max-h-80 overflow-y-auto py-1">
					{filtered.length === 0 ? (
						<p className="text-sm text-muted-foreground text-center py-6">
							No commands match "{query}"
						</p>
					) : (
						filtered.map((cmd) => (
							<button
								key={cmd.id}
								type="button"
								onClick={() => {
									cmd.action();
									onClose();
								}}
								className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-accent/50 focus:outline-none focus:bg-accent/50"
							>
								<span className="size-5 flex items-center justify-center text-muted-foreground">
									{cmd.icon}
								</span>
								<span className="flex-1 text-sm">{cmd.label}</span>
								{cmd.shortcut && (
									<span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
										{cmd.shortcut}
									</span>
								)}
							</button>
						))
					)}
				</div>

				<div className="p-2 border-t border-border bg-muted/30 rounded-b-lg">
					<p className="text-xs text-muted-foreground text-center">
						<XMarkIcon className="size-3 inline mr-1" />
						Esc to close � ?? to navigate � Enter to select
					</p>
				</div>
			</div>
		</div>
	);
}
