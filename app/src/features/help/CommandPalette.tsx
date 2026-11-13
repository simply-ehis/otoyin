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
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { HelpSearchResult } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { SETTINGS_SCHEMA, type SettingDef } from "@/lib/settings/schema";
import { REGISTRY, tabByPath } from "@/lib/tabs/registry";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const RECENTS_KEY = "otoyin:search-recents";
const MAX_RECENTS = 5;
const MIN_HELP_QUERY = 2;

interface Command {
	id: string;
	label: string;
	category: string;
	icon: React.ReactNode;
	action: () => void;
	shortcut?: string;
}

interface TabResult {
	entry: (typeof REGISTRY)[number];
	score: number;
	hidden: boolean;
}

interface SettingResult {
	def: SettingDef;
	score: number;
}

const MAX_SETTING_RESULTS = 5;

// Haystacks never change — build them once up front instead of re-templating
// and lower-casing 11 strings on every keystroke.
const SETTING_HAYSTACKS = SETTINGS_SCHEMA.map(
	(def) =>
		`${def.label} ${def.description} ${def.group} ${def.keywords.join(" ")}`,
);

/**
 * Fuzzy score for a query against a haystack.
 * Exact > prefix > substring > subsequence (typo-tolerant). Returns 0 when
 * there is no match so callers can filter. Keywords in the registry act as
 * synonyms (e.g. "denoise" finds "Noise Reduction").
 */
function scoreMatch(query: string, haystack: string): number {
	const q = query.toLowerCase();
	const t = haystack.toLowerCase();
	if (!q || !t) {
		return 0;
	}
	if (t === q) {
		return 100;
	}
	if (t.startsWith(q)) {
		return 90;
	}
	if (t.includes(q)) {
		return 80;
	}
	// Subsequence match: every query char appears in order (typo tolerant).
	let j = 0;
	let score = 60;
	let consecutive = 0;
	let wordStartBonus = 0;
	let prevSpace = true;
	for (let i = 0; i < t.length; i++) {
		const ch = t[i];
		if (ch === " " || ch === "-" || ch === "/" || ch === "_") {
			prevSpace = true;
			continue;
		}
		if (ch === q[j]) {
			j++;
			consecutive++;
			score += consecutive;
			if (prevSpace) {
				wordStartBonus += 5;
			}
			prevSpace = false;
			if (j === q.length) {
				break;
			}
		} else {
			consecutive = 0;
			prevSpace = false;
		}
	}
	return j === q.length ? score + wordStartBonus : 0;
}

export function CommandPalette({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const [helpResults, setHelpResults] = useState<HelpSearchResult[]>([]);
	const [helpLoading, setHelpLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();

	const hiddenTabs = useWorkspaceStore((s) => s.hiddenTabs);
	const showTab = useWorkspaceStore((s) => s.showTab);

	const getRecents = useCallback((): string[] => {
		try {
			const raw = localStorage.getItem(RECENTS_KEY);
			return raw ? (JSON.parse(raw) as string[]) : [];
		} catch {
			return [];
		}
	}, []);

	const addRecent = useCallback(
		(path: string) => {
			try {
				let list = getRecents();
				list = [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENTS);
				localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
			} catch {
				// localStorage may be unavailable in some environments.
			}
		},
		[getRecents],
	);

	// --- Commands (static, always searchable) ------------------------------

	const commands = useMemo<Command[]>(
		() => [
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
				action: () => navigate({ to: "/mixer" }),
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
				action: () => navigate({ to: "/conversation" }),
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
				action: () => navigate({ to: "/library" }),
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
		],
		[navigate, onClose],
	);

	const commandResults = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) {
			return commands;
		}
		return commands.filter(
			(c) =>
				c.label.toLowerCase().includes(q) ||
				c.category.toLowerCase().includes(q),
		);
	}, [query, commands]);

	// --- Tabs from the registry (incl. hidden, one-click Enable) ----------

	const tabResults = useMemo<TabResult[]>(() => {
		const q = query.trim();
		if (!q) {
			return [];
		}
		return REGISTRY.map((entry) => {
			const label = t(entry.labelKey, {
				defaultValue: entry.path,
			});
			const haystack = `${label} ${entry.path} ${entry.keywords.join(" ")}`;
			const score = scoreMatch(q, haystack);
			return score > 0
				? { entry, score, hidden: hiddenTabs.includes(entry.path) }
				: null;
		}).filter((r): r is TabResult => r !== null);
	}, [query, t, hiddenTabs]);

	// Sort tabs by score desc, then path asc for stable ordering.
	tabResults.sort(
		(a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path),
	);

	// --- Settings from the schema (keywords are consumed here) -----------

	const settingsResults = useMemo<SettingResult[]>(() => {
		const q = query.trim();
		if (!q) {
			return [];
		}
		return SETTINGS_SCHEMA.map((def, i) => {
			const score = scoreMatch(q, SETTING_HAYSTACKS[i]);
			return score > 0 ? { def, score } : null;
		})
			.filter((r): r is SettingResult => r !== null)
			.sort((a, b) => b.score - a.score || a.def.key.localeCompare(b.def.key))
			.slice(0, MAX_SETTING_RESULTS);
	}, [query]);

	// --- Help catalog (server-side, debounced) ----------------------------

	useEffect(() => {
		const q = query.trim();
		if (q.length < MIN_HELP_QUERY) {
			setHelpResults([]);
			setHelpLoading(false);
			return;
		}
		setHelpLoading(true);
		const timer = setTimeout(() => {
			apiClient
				.searchHelp(q)
				.then((res) => setHelpResults(res.results))
				.catch((err: unknown) => {
					setHelpResults([]);
					showStudioErrorToast(err);
				})
				.finally(() => setHelpLoading(false));
		}, 250);
		return () => clearTimeout(timer);
	}, [query]);

	// --- Focus, keyboard, click-outside -----------------------------------

	const getSelectableItems = useCallback(() => {
		// Built on each call so keyboard nav always reflects the current list.
		const items: Array<{ kind: string; id?: string; action: () => void }> = [];
		if (!query) {
			for (const recent of getRecents()) {
				const entry = tabByPath(recent);
				if (entry) {
					items.push({
						kind: "tab",
						action: () => {
							navigate({ to: entry.path });
							addRecent(entry.path);
							onClose();
						},
					});
				}
			}
		}
		for (const cmd of commandResults) {
			items.push({
				kind: "command",
				action: () => {
					cmd.action();
					onClose();
				},
			});
		}
		for (const tab of tabResults) {
			items.push({
				kind: "tab",
				action: () => {
					if (tab.hidden) {
						showTab(tab.entry.path);
					}
					navigate({ to: tab.entry.path });
					addRecent(tab.entry.path);
					onClose();
				},
			});
		}
		for (const setting of settingsResults) {
			items.push({
				kind: "setting",
				id: setting.def.key,
				action: () => {
					navigate({ to: "/settings/schema" });
					onClose();
				},
			});
		}
		helpResults.forEach(() => {
			items.push({
				kind: "help",
				action: () => {
					onClose();
					window.dispatchEvent(
						new CustomEvent("open-help-center", {
							detail: { query: query.trim() },
						}),
					);
				},
			});
		});
		return items;
	}, [
		query,
		getRecents,
		commandResults,
		tabResults,
		settingsResults,
		helpResults,
		navigate,
		showTab,
		addRecent,
		onClose,
	]);

	useEffect(() => {
		if (!open) {
			setSelectedIndex(-1);
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
				return;
			}
			const items = getSelectableItems();
			if (items.length === 0) {
				return;
			}
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSelectedIndex((i) => (i + 1) % items.length);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setSelectedIndex((i) => (i - 1 + items.length) % items.length);
			} else if (event.key === "Enter") {
				event.preventDefault();
				const item = items[selectedIndex >= 0 ? selectedIndex : 0];
				if (item) {
					item.action();
					onClose();
				}
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, onClose, selectedIndex, getSelectableItems]);

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
						<MagnifyingGlassIcon
							className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground"
							aria-hidden="true"
						/>
						<input
							ref={inputRef}
							type="text"
							placeholder="Type a command or search…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="w-full pl-10 pr-4 py-2 bg-background rounded-md border border-input focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
				</div>

				<div className="max-h-80 overflow-y-auto py-1">{renderResults()}</div>

				<div className="p-2 border-t border-border bg-secondary rounded-b-lg">
					<p className="text-xs text-muted-foreground text-center">
						<XMarkIcon className="size-3 inline mr-1" />
						Esc to close — ↑↓ to navigate — Enter to select
					</p>
				</div>
			</div>
		</div>
	);

	/* ---- rendered results ---- */
	function renderResults() {
		const q = query.trim();
		const recentsList = getRecents();
		const hasRecents = !q && recentsList.length > 0;
		const hasCommands = commandResults.length > 0;
		const hasTabs = tabResults.length > 0;
		const hasSettings = settingsResults.length > 0;
		const hasHelp = helpResults.length > 0;

		// Flat index of every selectable row, in render order, so keyboard
		// nav (↑↓/Enter) moves across section boundaries.
		const order: Array<{ kind: string; id: string }> = [];
		if (hasRecents) {
			for (const path of recentsList) {
				order.push({ kind: "recent", id: path });
			}
		}
		for (const cmd of commandResults) {
			order.push({ kind: "command", id: cmd.id });
		}
		for (const tab of tabResults) {
			order.push({ kind: "tab", id: tab.entry.path });
		}
		for (const setting of settingsResults) {
			order.push({ kind: "setting", id: setting.def.key });
		}
		for (const hit of helpResults) {
			order.push({ kind: "help", id: hit.id });
		}

		const nothing =
			!hasRecents &&
			!hasCommands &&
			!hasTabs &&
			!hasSettings &&
			!hasHelp &&
			!helpLoading;

		if (nothing) {
			return (
				<p className="text-sm text-muted-foreground text-center py-6">
					No commands match "{q}"
				</p>
			);
		}

		const sections: Array<{ title: string; nodes: ReactNode }> = [];

		if (hasRecents) {
			sections.push({
				title: "Recent",
				nodes: (
					<>
						{recentsList.map((path) => {
							const entry = tabByPath(path);
							if (!entry) {
								return null;
							}
							const flatIndex = order.findIndex(
								(o) => o.kind === "recent" && o.id === path,
							);
							return (
								<SelectableRow
									key={path}
									icon={<entry.icon className="size-4" aria-hidden="true" />}
									label={t(entry.labelKey, {
										defaultValue: entry.path,
									})}
									subtitle={entry.path}
									onSelect={() => {
										navigate({ to: entry.path });
										addRecent(entry.path);
										onClose();
									}}
									selected={selectedIndex === flatIndex}
								/>
							);
						})}
					</>
				),
			});
		}

		if (hasCommands) {
			sections.push({
				title: "Commands",
				nodes: (
					<>
						{commandResults.map((cmd) => {
							const flatIndex = order.findIndex(
								(o) => o.kind === "command" && o.id === cmd.id,
							);
							return (
								<SelectableRow
									key={cmd.id}
									icon={cmd.icon}
									label={cmd.label}
									subtitle={cmd.category}
									shortcut={cmd.shortcut}
									onSelect={cmd.action}
									selected={selectedIndex === flatIndex}
								/>
							);
						})}
					</>
				),
			});
		}

		if (hasTabs) {
			sections.push({
				title: "Tabs",
				nodes: (
					<>
						{tabResults.map((tab) => {
							const label = t(tab.entry.labelKey, {
								defaultValue: tab.entry.path,
							});
							const flatIndex = order.findIndex(
								(o) => o.kind === "tab" && o.id === tab.entry.path,
							);
							return (
								<SelectableRow
									key={tab.entry.path}
									icon={
										<tab.entry.icon className="size-4" aria-hidden="true" />
									}
									label={label}
									subtitle={
										tab.hidden
											? `${tab.entry.path} (hidden)`
											: tab.entry.keywords.slice(0, 4).join(" • ")
									}
									onSelect={() => {
										if (tab.hidden) {
											showTab(tab.entry.path);
										}
										navigate({ to: tab.entry.path });
										addRecent(tab.entry.path);
										onClose();
									}}
									selected={selectedIndex === flatIndex}
									hidden={tab.hidden}
								/>
							);
						})}
					</>
				),
			});
		}

		if (hasSettings) {
			sections.push({
				title: "Settings",
				nodes: (
					<>
						{settingsResults.map((setting) => {
							const flatIndex = order.findIndex(
								(o) => o.kind === "setting" && o.id === setting.def.key,
							);
							return (
								<SelectableRow
									key={setting.def.key}
									icon={<Cog6ToothIcon className="size-4" aria-hidden="true" />}
									label={setting.def.label}
									subtitle={`${setting.def.group} — ${setting.def.description}`}
									onSelect={() => {
										navigate({ to: "/settings/schema" });
										onClose();
									}}
									selected={selectedIndex === flatIndex}
								/>
							);
						})}
					</>
				),
			});
		}

		if (hasHelp) {
			sections.push({
				title: "Help results",
				nodes: (
					<>
						{helpResults.map((hit) => {
							const flatIndex = order.findIndex(
								(o) => o.kind === "help" && o.id === hit.id,
							);
							return (
								<SelectableRow
									key={hit.id}
									icon={<SparklesIcon className="size-4" aria-hidden="true" />}
									label={hit.name}
									subtitle={hit.where}
									onSelect={() => {
										onClose();
										window.dispatchEvent(
											new CustomEvent("open-help-center", {
												detail: { query: q },
											}),
										);
									}}
									selected={selectedIndex === flatIndex}
								/>
							);
						})}
					</>
				),
			});
		}

		if (helpLoading && helpResults.length === 0) {
			sections.push({
				title: "",
				nodes: (
					<p className="px-4 py-2 text-xs text-muted-foreground">
						Searching help…
					</p>
				),
			});
		}

		return (
			<>
				{sections.map((section) => (
					<>
						{section.title && (
							<p className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								{section.title}
							</p>
						)}
						{section.nodes}
					</>
				))}
			</>
		);
	}
}

/**
 * Single selectable result row. Highlighted when `selected`; clicking or
 * Enter invokes `onSelect`.
 */
function SelectableRow({
	icon,
	label,
	subtitle,
	shortcut,
	onSelect,
	selected,
	hidden,
}: {
	icon: React.ReactNode;
	label: string;
	subtitle?: string;
	shortcut?: string;
	onSelect: () => void;
	selected: boolean;
	hidden?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={`
				w-full flex items-center gap-3 px-4 py-2 text-left
				transition-colors focus:outline-none
				${
					selected
						? "bg-accent text-accent-foreground"
						: "hover:bg-secondary focus:bg-secondary focus:text-foreground"
				}
			`}
		>
			<span className="size-5 flex items-center justify-center text-muted-foreground">
				{icon}
			</span>
			<span className="flex-1 min-w-0">
				{hidden ? (
					<span className="flex items-center gap-1">
						<span className="text-sm">{label}</span>
						<span className="text-[10px] font-medium text-muted-foreground">
							(hidden)
						</span>
					</span>
				) : (
					<span className="block truncate text-sm">{label}</span>
				)}
				{subtitle && (
					<span className="block truncate text-xs text-muted-foreground">
						{subtitle}
					</span>
				)}
			</span>
			{shortcut && (
				<span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
					{shortcut}
				</span>
			)}
		</button>
	);
}
