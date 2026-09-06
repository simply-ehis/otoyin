import { CheckIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils/cn";
import {
	PLAIN_THEMES,
	SPECIAL_THEMES,
	THEME_META,
	type Theme,
	useUIStore,
} from "@/stores/uiStore";

/** Solid thumbnail washes (pure CSS, no image assets). */
const THUMB_WASH: Record<string, string> = {
	"di-stefano":
		"linear-gradient(135deg, hsl(28 6% 9%) 0%, hsl(28 5% 16%) 100%)",
	stripe:
		"repeating-linear-gradient(135deg, hsl(0 0% 8%) 0 8px, hsl(0 0% 14%) 8px 16px)",
	"coastal-light":
		"linear-gradient(135deg, hsl(35 40% 96%) 0%, hsl(25 30% 92%) 100%)",
	"mesh-dark":
		"radial-gradient(ellipse at 30% 20%, hsl(215 20% 18%) 0%, hsl(215 20% 4%) 70%)",
	system: "linear-gradient(135deg, hsl(0 0% 94%) 0%, hsl(0 0% 98%) 100%)",
	light: "linear-gradient(135deg, hsl(0 0% 96%) 0%, hsl(0 0% 100%) 100%)",
	dark: "linear-gradient(135deg, hsl(0 0% 6%) 0%, hsl(0 0% 14%) 100%)",
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
				active
					? "border-accent shadow-[0_0_12px_hsl(348_68%_58%/0.3)]"
					: "border-border hover:border-strong",
			)}
		>
			<span
				aria-hidden="true"
				className="grid h-14 w-full place-items-center overflow-hidden rounded-sm border border-border"
				style={{ background: THUMB_WASH[theme] ?? THUMB_WASH.dark }}
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

/** Theme gallery: plain themes first, special looks below the fold line. */
export function ThemeSelect() {
	const theme = useUIStore((s) => s.theme);
	const setTheme = useUIStore((s) => s.setTheme);
	return (
		<div className="flex flex-col gap-3">
			<fieldset className="grid grid-cols-4 gap-2">
				<legend className="sr-only">Color themes</legend>
				{PLAIN_THEMES.map((t) => (
					<ThemeCard
						key={t}
						theme={t}
						active={theme === t}
						onSelect={() => setTheme(t)}
					/>
				))}
				<ThemeCard
					theme="di-stefano"
					active={theme === "di-stefano"}
					onSelect={() => setTheme("di-stefano")}
				/>
			</fieldset>
			<div className="relative" aria-hidden="true">
				<div className="absolute inset-0 flex items-center">
					<div className="w-full border-t border-border" />
				</div>
				<div className="relative flex justify-center">
					<span className="bg-background px-2 text-xs uppercase tracking-wider text-muted-foreground/70">
						Special
					</span>
				</div>
			</div>
			<fieldset className="grid grid-cols-3 gap-2">
				<legend className="sr-only">Special themes</legend>
				{SPECIAL_THEMES.filter((t) => t !== "di-stefano").map((t) => (
					<ThemeCard
						key={t}
						theme={t}
						active={theme === t}
						onSelect={() => setTheme(t)}
					/>
				))}
			</fieldset>
		</div>
	);
}
