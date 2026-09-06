import logo from "@/assets/Otoyin-logo.svg";
import { cn } from "@/lib/utils/cn";

interface AppLoadingScreenProps {
	label?: string;
	className?: string;
}

/** Branded loading surface for route and code-split application startup. */
export function AppLoadingScreen({
	label = "Loading Otoyin…",
	className,
}: AppLoadingScreenProps) {
	return (
		<output
			className={cn(
				"flex min-h-0 flex-1 items-center justify-center bg-background",
				className,
			)}
			aria-live="polite"
			aria-busy="true"
		>
			<div className="flex flex-col items-center gap-4 text-center">
				<div className="relative size-16">
					<div className="absolute inset-1 rounded-lg bg-accent opacity-[0.08] blur-xl animate-pulse" />
					<img
						src={logo}
						alt=""
						className="relative size-16 rounded-lg object-contain animate-logo-breath"
					/>
				</div>
				<div className="space-y-2">
					<p className="text-sm font-medium text-foreground/85">{label}</p>
					<div
						className="h-1 w-32 overflow-hidden rounded-full bg-muted"
						aria-hidden="true"
					>
						<div className="h-full w-1/2 rounded-full bg-accent animate-pulse" />
					</div>
				</div>
			</div>
		</output>
	);
}
