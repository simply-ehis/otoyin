import * as ProgressPrimitive from "@radix-ui/react-progress";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Progress({
	ref,
	className,
	value,
	...props
}: React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
	ref?: React.Ref<React.ComponentRef<typeof ProgressPrimitive.Root>>;
}) {
	return (
		<ProgressPrimitive.Root
			ref={ref}
			className={cn(
				"relative h-4 w-full overflow-hidden rounded-full bg-secondary",
				className,
			)}
			{...props}
		>
			<ProgressPrimitive.Indicator
				className="h-full w-full flex-1 bg-[hsl(0,0%,70%)] transition-transform"
				style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			/>
		</ProgressPrimitive.Root>
	);
}
