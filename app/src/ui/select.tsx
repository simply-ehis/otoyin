import * as SelectPrimitive from "@radix-ui/react-select";
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical select: long/searchable option lists (short fixed sets use
 * Segmented or Radio instead). Full keyboard model via Radix.
 */
export function Select(props: SelectPrimitive.SelectProps) {
	return <SelectPrimitive.Root {...props} />;
}

export function SelectValue(props: SelectPrimitive.SelectValueProps) {
	return <SelectPrimitive.Value {...props} />;
}

export function SelectTrigger({
	className,
	children,
	...props
}: SelectPrimitive.SelectTriggerProps) {
	return (
		<SelectPrimitive.Trigger
			className={cn(
				"flex h-9 w-full items-center justify-between gap-2 rounded-sm border border-input bg-sunken px-3 text-sm text-foreground",
				"transition-colors duration-150 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
				className,
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon asChild>
				<ChevronDownIcon aria-hidden="true" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

export function SelectContent({
	className,
	children,
	position = "popper",
	...props
}: SelectPrimitive.SelectContentProps) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				position={position}
				className={cn(
					"z-[90] max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover shadow-[0_4px_12px_rgba(0,0,0,0.45)]",
					"ds-enter ds-exit origin-[var(--radix-select-content-transform-origin)]",
					position === "popper" && "w-[var(--radix-select-trigger-width)]",
					className,
				)}
				{...props}
			>
				<SelectPrimitive.ScrollUpButton className="grid place-items-center py-1 text-muted-foreground">
					<ChevronUpIcon className="size-4" aria-hidden="true" />
				</SelectPrimitive.ScrollUpButton>
				<SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
				<SelectPrimitive.ScrollDownButton className="grid place-items-center py-1 text-muted-foreground">
					<ChevronDownIcon className="size-4" aria-hidden="true" />
				</SelectPrimitive.ScrollDownButton>
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
}

export function SelectItem({
	className,
	children,
	...props
}: SelectPrimitive.SelectItemProps) {
	return (
		<SelectPrimitive.Item
			className={cn(
				"flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors",
				"hover:bg-secondary focus:bg-secondary focus:outline-none",
				"disabled:cursor-not-allowed disabled:opacity-40",
				className,
			)}
			{...props}
		>
			<span className="grid size-4 shrink-0 place-items-center">
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="size-3.5" aria-hidden="true" />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}

export function SelectSeparator({
	className,
	...props
}: SelectPrimitive.SelectSeparatorProps) {
	return (
		<SelectPrimitive.Separator
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			{...props}
		/>
	);
}
