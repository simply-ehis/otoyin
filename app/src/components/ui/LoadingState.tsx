import { cn } from "@/lib/utils/cn";
import { Spinner } from "./Spinner";

interface LoadingStateProps {
	label?: string;
	className?: string;
}

// Centered, full-area loading placeholder used to gate a view's primary content.
export function LoadingState({
	label = "Loading…",
	className,
}: LoadingStateProps) {
	return (
		<output
			className={cn("flex flex-1 items-center justify-center py-10", className)}
			aria-live="polite"
			aria-busy="true"
		>
			<Spinner label={label} />
		</output>
	);
}
