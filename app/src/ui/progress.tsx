import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical progress: only where progress is real and measured
 * (downloads, exports). Indeterminate waits get Spinner instead.
 */
export function Progress({
	className,
	value,
	max = 100,
	label,
	...props
}: ProgressPrimitive.ProgressProps & { label?: string }) {
	return (
		<ProgressPrimitive.Root
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={max}
			aria-valuenow={value ?? undefined}
			value={value}
			max={max}
			className={cn(
				"relative h-1.5 w-full overflow-hidden rounded-full bg-strong",
				className,
			)}
			{...props}
		>
			<ProgressPrimitive.Indicator
				className="h-full bg-primary transition-transform duration-200 ease-out"
				style={{
					transform: `translateX(-${100 - Math.min(100, Math.max(0, ((value ?? 0) / max) * 100))}%)`,
				}}
			/>
		</ProgressPrimitive.Root>
	);
}
