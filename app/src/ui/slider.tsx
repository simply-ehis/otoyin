import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical slider: full keyboard model (arrows/Home/End) via Radix.
 * Thumb hit target padded beyond its visible size.
 */
export function Slider({ className, ...props }: SliderPrimitive.SliderProps) {
	return (
		<SliderPrimitive.Root
			className={cn(
				"relative flex h-6 w-full touch-none select-none items-center",
				"disabled:cursor-not-allowed disabled:opacity-40",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-strong">
				<SliderPrimitive.Range className="absolute h-full bg-primary" />
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb
				aria-label={props["aria-label"] ?? "Value"}
				className={cn(
					"block size-4 shrink-0 cursor-grab rounded-full border border-strong bg-foreground",
					"transition-transform duration-150 active:cursor-grabbing active:scale-110",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					"disabled:cursor-not-allowed",
					// Invisible hit padding: 24px target around a 16px thumb.
					"before:absolute before:-inset-2 before:content-['']",
				)}
			/>
		</SliderPrimitive.Root>
	);
}
