import loaderSvg from "@/assets/Otoyin-loader.svg";
import { cn } from "@/lib/utils/cn";

type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

const SIZE_MAP: Record<SpinnerSize, string> = {
	xs: "size-3",
	sm: "h-3.5 w-3.5",
	md: "size-4",
	lg: "size-5",
	xl: "size-6",
	xxl: "size-8",
};

interface SpinnerProps {
	className?: string;
	label?: string;
	size?: SpinnerSize;
}

export function Spinner({ className, label, size = "md" }: SpinnerProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 text-muted-foreground",
				className,
			)}
			aria-live="polite"
		>
			<img
				src={loaderSvg}
				alt=""
				className={cn(SIZE_MAP[size], "object-contain")}
				aria-hidden="true"
			/>
			{label ? <span className="text-sm">{label}</span> : null}
		</span>
	);
}
