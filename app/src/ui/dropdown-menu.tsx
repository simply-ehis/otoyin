import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CheckIcon } from "@heroicons/react/24/outline";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical dropdown menu: origin-aware, solid surface, arrow-key
 * navigation via Radix. Trigger toggles (never double-opens).
 */
export function DropdownMenu(props: DropdownMenuPrimitive.DropdownMenuProps) {
	return <DropdownMenuPrimitive.Root {...props} />;
}

export function DropdownMenuTrigger(
	props: DropdownMenuPrimitive.DropdownMenuTriggerProps,
) {
	return <DropdownMenuPrimitive.Trigger {...props} />;
}

export function DropdownMenuContent({
	className,
	sideOffset = 8,
	...props
}: DropdownMenuPrimitive.DropdownMenuContentProps) {
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				sideOffset={sideOffset}
				className={cn(
					"z-[90] min-w-[180px] rounded-md border border-border bg-popover p-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.25)]",
					"ds-enter ds-exit origin-[var(--radix-dropdown-menu-content-transform-origin)]",
					className,
				)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	);
}

const itemStyles =
	"flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0";

export function DropdownMenuItem({
	className,
	inset,
	...props
}: DropdownMenuPrimitive.DropdownMenuItemProps & { inset?: boolean }) {
	return (
		<DropdownMenuPrimitive.Item
			className={cn(itemStyles, inset && "pl-8", className)}
			{...props}
		/>
	);
}

export function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	...props
}: DropdownMenuPrimitive.DropdownMenuCheckboxItemProps) {
	return (
		<DropdownMenuPrimitive.CheckboxItem
			className={cn(itemStyles, className)}
			checked={checked}
			{...props}
		>
			<span className="grid size-4 shrink-0 place-items-center">
				{checked ? <CheckIcon className="size-3.5" aria-hidden="true" /> : null}
			</span>
			{children}
		</DropdownMenuPrimitive.CheckboxItem>
	);
}

export function DropdownMenuSeparator({
	className,
	...props
}: DropdownMenuPrimitive.DropdownMenuSeparatorProps) {
	return (
		<DropdownMenuPrimitive.Separator
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			{...props}
		/>
	);
}

export function DropdownMenuLabel({
	className,
	...props
}: DropdownMenuPrimitive.DropdownMenuLabelProps & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<DropdownMenuPrimitive.Label
			className={cn(
				"px-2 py-1 text-xs font-medium text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}
