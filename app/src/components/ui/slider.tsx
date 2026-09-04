import * as SliderPrimitive from "@radix-ui/react-slider";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Slider({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
	ref?: React.Ref<React.ComponentRef<typeof SliderPrimitive.Root>>;
}) {
	return (
		<SliderPrimitive.Root
			ref={ref}
			className={cn(
				"relative flex w-full touch-none select-none items-center",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
				<SliderPrimitive.Range className="absolute h-full bg-primary" />
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb className="block size-0 outline-none disabled:pointer-events-none disabled:opacity-50 after:block after:h-5 after:w-5 after:rounded-full after:border-2 after:border-primary after:bg-background after:ring-offset-background after:transition-colors after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2" />
		</SliderPrimitive.Root>
	);
}
