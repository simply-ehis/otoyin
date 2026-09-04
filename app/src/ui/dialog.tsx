import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical dialog: blocking decisions only. Capped width, centered
 * origin, focus trap + Escape via Radix, dimmed (never blurred) scrim.
 */
export function Dialog(props: DialogPrimitive.DialogProps) {
	return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(props: DialogPrimitive.DialogTriggerProps) {
	return <DialogPrimitive.Trigger {...props} />;
}

export function DialogClose(props: DialogPrimitive.DialogCloseProps) {
	return <DialogPrimitive.Close {...props} />;
}

export function DialogOverlay({
	className,
	...props
}: DialogPrimitive.DialogOverlayProps) {
	return (
		<DialogPrimitive.Overlay
			className={cn(
				"fixed inset-0 z-50 bg-black/60 ds-fade-in ds-fade-out",
				className,
			)}
			{...props}
		/>
	);
}

export function DialogContent({
	className,
	showClose = true,
	...props
}: DialogPrimitive.DialogContentProps & { showClose?: boolean }) {
	return (
		<DialogPrimitive.Portal>
			<DialogOverlay />
			<DialogPrimitive.Content
				className={cn(
					"fixed left-1/2 top-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2",
					"rounded-lg border border-border bg-popover p-6 shadow-[0_12px_32px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]",
					"ds-enter ds-exit",
					className,
				)}
				{...props}
			>
				{props.children}
				{showClose ? (
					<DialogPrimitive.Close
						title="Close"
						aria-label="Close dialog"
						className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					>
						<XMarkIcon className="size-4" />
					</DialogPrimitive.Close>
				) : null}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

export function DialogHeader({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn("mb-4 flex flex-col gap-1 pr-8", className)} {...props} />
	);
}

export function DialogTitle({
	className,
	...props
}: DialogPrimitive.DialogTitleProps) {
	return (
		<DialogPrimitive.Title
			className={cn(
				"text-[15px] font-semibold tracking-tight text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function DialogDescription({
	className,
	...props
}: DialogPrimitive.DialogDescriptionProps) {
	return (
		<DialogPrimitive.Description
			className={cn("text-[13px] text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function DialogFooter({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("mt-6 flex items-center justify-end gap-2", className)}
			{...props}
		/>
	);
}
