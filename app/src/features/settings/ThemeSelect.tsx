import { CheckIcon } from "@heroicons/react/24/outline";
import { ACCENT_PRESETS } from "@/lib/design-system";
import { cn } from "@/lib/utils/cn";
import {
	BACKGROUND_PATTERN_META,
	BACKGROUND_PATTERNS,
	PLAIN_THEMES,
	SPECIAL_THEMES,
	THEME_META,
	type Theme,
	useUIStore,
} from "@/stores/uiStore";

/** Solid thumbnail washes (pure CSS, no image assets). */
const THUMB_WASH: Record<Theme, string> = {
	// Split card: half light, half dark to read as "follow the OS"
	system:
		"linear-gradient(135deg, hsl(0 0% 96%) 0 50%, hsl(0 0% 10%) 50% 100%)",
	light: "linear-gradient(135deg, hsl(0 0% 96%) 0%, hsl(0 0% 100%) 100%)",
	dark: "linear-gradient(135deg, hsl(0 0% 6%) 0%, hsl(0 0% 14%) 100%)",
	stripe:
		"repeating-linear-gradient(135deg, hsl(0 0% 8%) 0 8px, hsl(0 0% 14%) 8px 16px)",
};

function ThemeCard({
	theme,
	active,
	onSelect,
}: {
	theme: Theme;
	active: boolean;
	onSelect: () => void;
}) {
	const meta = THEME_META[theme];
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={active}
			className={cn(
				"relative flex flex-col items-center gap-2 rounded-md border-2 p-2 transition-all duration-150",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				active ? "border-accent" : "border-border hover:border-strong",
			)}
		>
			<span
				aria-hidden="true"
				className="grid h-14 w-full place-items-center overflow-hidden rounded-sm border border-border"
				style={{ background: THUMB_WASH[theme] }}
			>
				<span
					className="grid size-6 place-items-center rounded-full"
					style={{ background: meta.accent }}
				>
					{active ? (
						<CheckIcon className="size-3.5 text-white" aria-hidden="true" />
					) : null}
				</span>
			</span>
			<span className="text-xs font-medium leading-none text-muted-foreground">
				{meta.label}
			</span>
			{active ? (
				<span
					aria-hidden="true"
					className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-background bg-accent"
				/>
			) : null}
		</button>
	);
}

/** Accent picker: presets come from ACCENT_PRESETS; rose is the default. */
function AccentPicker() {
	const accent = useUIStore((s) => s.accent);
	const setAccent = useUIStore((s) => s.setAccent);
	return (
		<fieldset className="grid grid-cols-6 gap-2">
			<legend className="sr-only">Accent colour</legend>
			{ACCENT_PRESETS.map((preset) => {
				const active = accent === preset.id;
				return (
					<button
						key={preset.id}
						type="button"
						onClick={() => setAccent(preset.id)}
						aria-pressed={active}
						title={preset.label}
						aria-label={`Accent: ${preset.label}`}
						className={cn(
							"group flex flex-col items-center gap-1.5 rounded-md border-2 p-1.5 transition-all duration-150",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							active ? "border-accent" : "border-border hover:border-strong",
						)}
					>
						<span
							aria-hidden="true"
							className="grid size-7 place-items-center rounded-full border border-black/10"
							style={{ background: `hsl(${preset.hsl})` }}
						>
							{active ? (
								<CheckIcon className="size-3.5 text-white" aria-hidden="true" />
							) : null}
						</span>
						<span className="text-[10px] font-medium leading-none text-muted-foreground">
							{preset.label}
						</span>
					</button>
				);
			})}
		</fieldset>
	);
}

/** Background tile picker: None / Line in motion / Waveform / Mesh. */
function BackgroundPicker() {
	const backgroundPattern = useUIStore((s) => s.backgroundPattern);
	const setBackgroundPattern = useUIStore((s) => s.setBackgroundPattern);
	return (
		<fieldset className="grid grid-cols-4 gap-2">
			<legend className="sr-only">Background pattern</legend>
			{BACKGROUND_PATTERNS.map((pattern) => {
				const active = backgroundPattern === pattern;
				const meta = BACKGROUND_PATTERN_META[pattern];
				const isNone = pattern === "none";
				const isMesh = pattern === "mesh";
				const style = isMesh
					? undefined
					: isNone
						? { background: "hsl(var(--theme-surface, 30 5% 12%))" }
						: {
								backgroundColor: "var(--pattern-color)",
								WebkitMaskImage:
									pattern === "waveform"
										? "var(--pattern-tile-waveform)"
										: "var(--pattern-tile)",
								maskImage:
									pattern === "waveform"
										? "var(--pattern-tile-waveform)"
										: "var(--pattern-tile)",
								WebkitMaskSize:
									pattern === "waveform" ? "96px 96px" : "120px 120px",
								maskSize: pattern === "waveform" ? "96px 96px" : "120px 120px",
								WebkitMaskRepeat: "repeat",
								maskRepeat: "repeat",
								opacity: 0.6,
							};
				return (
					<button
						key={pattern}
						type="button"
						onClick={() => setBackgroundPattern(pattern)}
						aria-pressed={active}
						title={meta.hint}
						className={cn(
							"relative flex flex-col items-center gap-2 rounded-md border-2 p-2 transition-all duration-150",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							active ? "border-accent" : "border-border hover:border-strong",
						)}
					>
						<span
							aria-hidden="true"
							className="relative h-14 w-full overflow-hidden rounded-sm border border-border"
							style={style}
						>
							{isMesh && (
								<span className="gs-theme-pattern--mesh absolute inset-0" />
							)}
						</span>
						<span className="text-xs font-medium leading-none text-muted-foreground">
							{meta.label}
						</span>
						{active ? (
							<span
								aria-hidden="true"
								className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-background bg-accent"
							/>
						) : null}
					</button>
				);
			})}
		</fieldset>
	);
}

/** Theme gallery + background picker + accent picker. */
export function ThemeSelect() {
	const theme = useUIStore((s) => s.theme);
	const setTheme = useUIStore((s) => s.setTheme);
	return (
		<div className="flex flex-col gap-3">
			<fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<legend className="sr-only">Color themes</legend>
				{PLAIN_THEMES.map((t) => (
					<ThemeCard
						key={t}
						theme={t}
						active={theme === t}
						onSelect={() => setTheme(t)}
					/>
				))}
				{SPECIAL_THEMES.map((t) => (
					<ThemeCard
						key={t}
						theme={t}
						active={theme === t}
						onSelect={() => setTheme(t)}
					/>
				))}
			</fieldset>
			<div className="pt-1 border-t border-border">
				<h3 className="mb-2 px-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Accent
				</h3>
				<AccentPicker />
			</div>
			<div className="pt-1 border-t border-border">
				<h3 className="mb-2 px-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Background
				</h3>
				<BackgroundPicker />
			</div>
		</div>
	);
}
