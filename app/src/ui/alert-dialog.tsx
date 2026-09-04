import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

/**
 * Canonical destructive confirmation: consequence stated in the body,
 * danger action never the default focus. Width capped.
 */
export function AlertDialog(props: AlertDialogPrimitive.AlertDialogProps) {
	return <AlertDialogPrimitive.Root {...props} />;
}

export function AlertDialogTrigger(
	props: AlertDialogPrimitive.AlertDialogTriggerProps,
) {
	return <AlertDialogPrimitive.Trigger {...props} />;
}

export function AlertDialogContent({
	className,
	...props
}: AlertDialogPrimitive.AlertDialogContentProps) {
	return (
		<AlertDialogPrimitive.Portal>
			<AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 ds-fade-in ds-fade-out" />
			<AlertDialogPrimitive.Content
				className={cn(
					"fixed left-1/2 top-1/2 z-50 w-full max-w-[440px] -translate-x-1/2 -translate-y-1/2",
					"rounded-lg border border-border bg-popover p-6 shadow-[0_12px_32px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]",
					"ds-enter ds-exit",
					className,
				)}
				{...props}
			/>
		</AlertDialogPrimitive.Portal>
	);
}

export function AlertDialogTitle({
	className,
	...props
}: AlertDialogPrimitive.AlertDialogTitleProps) {
	return (
		<AlertDialogPrimitive.Title
			className={cn(
				"text-[15px] font-semibold tracking-tight text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function AlertDialogDescription({
	className,
	...props
}: AlertDialogPrimitive.AlertDialogDescriptionProps) {
	return (
		<AlertDialogPrimitive.Description
			className={cn("mt-1.5 text-[13px] text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function AlertDialogFooter({
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

export function AlertDialogCancel({
	className,
	...props
}: AlertDialogPrimitive.AlertDialogCancelProps) {
	return (
		<AlertDialogPrimitive.Cancel asChild>
			<Button variant="ghost" className={className} {...props} />
		</AlertDialogPrimitive.Cancel>
	);
}

export function AlertDialogAction({
	className,
	danger = true,
	...props
}: AlertDialogPrimitive.AlertDialogActionProps & { danger?: boolean }) {
	return (
		<AlertDialogPrimitive.Action asChild>
			<Button
				variant={danger ? "destructive" : "default"}
				className={className}
				{...props}
			/>
		</AlertDialogPrimitive.Action>
	);
}
