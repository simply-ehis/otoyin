import { cn } from "@/lib/utils/cn";
import {
	PLAIN_THEMES,
	SPECIAL_THEMES,
	THEME_META,
	type Theme,
	useUIStore,
} from "@/stores/uiStore";

/** Thumbnail gradients � pure CSS, no image assets. */
const THUMB_GRADIENTS: Record<string, string> = {
	di_stefano: "linear-gradient(135deg, hsl(0 0% 3%) 0%, hsl(0 0% 12%) 100%)",
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
	onClick,
}: {
	theme: Theme;
	active: boolean;
	onClick: () => void;
}) {
	const meta = THEME_META[theme];

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"relative flex flex-col items-center gap-2 rounded-lg border-2 p-2 transition-transform hover:scale-[1.03]",
				active
					? "border-accent shadow-[0_0_12px_hsl(var(--accent)/0.3)]"
					: "border-border/40 hover:border-border/80",
			)}
		>
			<div
				className="h-14 w-full rounded-md overflow-hidden border border-border/30"
				style={{
					background: THUMB_GRADIENTS[theme] ?? THUMB_GRADIENTS.dark,
				}}
			>
				<div className="h-full w-full flex items-center justify-center">
					<div
						className="size-6 rounded-full border border-border bg-secondary"
						style={{ background: `hsl(${meta.accent})` }}
					/>
				</div>
			</div>
			<span className="text-xs font-medium text-muted-foreground leading-none">
				{meta.label}
			</span>
			{active && (
				<div className="absolute -top-1 -right-1 size-3 rounded-full bg-accent border-2 border-background" />
			)}
		</button>
	);
}

export function ThemeSelect() {
	const theme = useUIStore((s) => s.theme);
	const setTheme = useUIStore((s) => s.setTheme);

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-4 gap-2">
				{PLAIN_THEMES.map((t) => (
					<ThemeCard
						key={t}
						theme={t}
						active={theme === t}
						onClick={() => setTheme(t)}
					/>
				))}
				<ThemeCard
					theme="di-stefano"
					active={theme === "di-stefano"}
					onClick={() => setTheme("di-stefano")}
				/>
			</div>
			<div className="relative">
				<div className="absolute inset-0 flex items-center">
					<div className="w-full border-t border-border/40" />
				</div>
				<div className="relative flex justify-center">
					<span className="bg-background px-2 text-xs uppercase tracking-wider text-muted-foreground/60">
						Special
					</span>
				</div>
			</div>
			<div className="grid grid-cols-3 gap-2">
				{SPECIAL_THEMES.filter((t) => t !== "di-stefano").map((t) => (
					<ThemeCard
						key={t}
						theme={t}
						active={theme === t}
						onClick={() => setTheme(t)}
					/>
				))}
			</div>
		</div>
	);
}
