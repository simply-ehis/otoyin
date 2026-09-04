import { useForm } from "react-hook-form";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

export { useForm };
export type { UseFormReturn, FieldValues } from "react-hook-form";

/**
 * Canonical form shell: validates on submit, first invalid field
 * focused by the caller. Groups fields with relationship spacing.
 */
export function Form({
	className,
	...props
}: React.FormHTMLAttributes<HTMLFormElement>) {
	return (
		<form
			noValidate={false}
			className={cn("flex flex-col gap-4", className)}
			{...props}
		/>
	);
}

/** Button row at the foot of a form: primary action right-aligned. */
export function FormActions({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn("flex items-center justify-end gap-2 pt-1", className)} {...props} />
	);
}
