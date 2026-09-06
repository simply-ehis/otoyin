import { XMarkIcon } from "@heroicons/react/24/outline";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical drawer: side-anchored panel (transcript editor, inspectors).
 * Slides from the anchored edge; Escape + scrim dismiss; focus trapped.
 */
export function Drawer(props: DialogPrimitive.DialogProps) {
	return <DialogPrimitive.Root {...props} />;
}

export function DrawerTrigger(props: DialogPrimitive.DialogTriggerProps) {
	return <DialogPrimitive.Trigger {...props} />;
}

export function DrawerClose(props: DialogPrimitive.DialogCloseProps) {
	return <DialogPrimitive.Close {...props} />;
}

const drawerSideStyles: Record<string, string> = {
	right: "right-0 top-0 h-full w-[480px] max-w-[90vw] border-l",
	left: "left-0 top-0 h-full w-[480px] max-w-[90vw] border-r",
	bottom: "bottom-0 left-0 right-0 max-h-[85vh] border-t rounded-t-lg",
};

export function DrawerContent({
	className,
	side = "right",
	showClose = true,
	...props
}: DialogPrimitive.DialogContentProps & {
	side?: keyof typeof drawerSideStyles;
	showClose?: boolean;
}) {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 ds-fade-in ds-fade-out" />
			<DialogPrimitive.Content
				className={cn(
					"fixed z-50 flex flex-col bg-popover shadow-[0_12px_32px_rgba(0,0,0,0.55)]",
					"ds-enter ds-exit",
					drawerSideStyles[side],
					className,
				)}
				{...props}
			>
				{props.children}
				{showClose ? (
					<DialogPrimitive.Close
						title="Close"
						aria-label="Close panel"
						className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					>
						<XMarkIcon className="size-4" />
					</DialogPrimitive.Close>
				) : null}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

export function DrawerHeader({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1 border-b border-border p-4 pr-12",
				className,
			)}
			{...props}
		/>
	);
}

export function DrawerTitle({
	className,
	...props
}: DialogPrimitive.DialogTitleProps) {
	return (
		<DialogPrimitive.Title
			className={cn(
				"text-base font-semibold tracking-tight text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function DrawerDescription({
	className,
	...props
}: DialogPrimitive.DialogDescriptionProps) {
	return (
		<DialogPrimitive.Description
			className={cn("text-xs text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function DrawerFooter({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 border-t border-border p-4",
				className,
			)}
			{...props}
		/>
	);
}
