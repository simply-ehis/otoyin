import type * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

/**
 * Action button rendered inside a toast (e.g. "Update now").
 * `altText` doubles as the accessible name (screen-reader contract).
 */
export function ToastAction({
	altText,
	className,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { altText: string }) {
	return (
		<Button
			variant="outline"
			size="sm"
			title={altText}
			aria-label={altText}
			className={cn("mt-2 shrink-0", className)}
			{...props}
		/>
	);
}

export type ToastActionElement = React.ReactElement<typeof ToastAction>;
