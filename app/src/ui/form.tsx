import type * as React from "react";
import { createContext, useContext, useId } from "react";
import {
	Controller,
	type ControllerProps,
	type FieldPath,
	type FieldValues,
	useForm,
	useFormContext,
} from "react-hook-form";
import { cn } from "@/lib/utils/cn";

export { useForm };
export type { FieldValues, UseFormReturn } from "react-hook-form";
export { FormProvider } from "react-hook-form";

/** react-hook-form field bridge: wires Controller state to item + message. */
export function FormField<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
	return (
		<FormFieldContext.Provider value={{ name: props.name }}>
			<Controller {...props} />
		</FormFieldContext.Provider>
	);
}

const FormFieldContext = createContext<{ name: string }>({ name: "" });
const FormItemContext = createContext<{ id: string }>({ id: "" });

export function FormItem({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	const id = useId();
	return (
		<FormItemContext.Provider value={{ id }}>
			<div className={cn("flex flex-col gap-1", className)} {...props} />
		</FormItemContext.Provider>
	);
}

export function FormControl({
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	const { id } = useContext(FormItemContext);
	return <div id={`${id}-control`} {...props} />;
}

export function FormMessage({ className }: { className?: string }) {
	const { name } = useContext(FormFieldContext);
	const { getFieldState, formState } = useFormContext();
	const error = getFieldState(name as FieldPath<FieldValues>, formState).error;
	if (!error?.message) {
		return null;
	}
	return (
		<p role="alert" className={cn("text-xs text-destructive", className)}>
			{String(error.message)}
		</p>
	);
}

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

/** Hint text under a field (not an error). */
export function FormDescription({
	className,
	...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
	return (
		<p className={cn("text-xs text-muted-foreground", className)} {...props} />
	);
}

/** Button row at the foot of a form: primary action right-aligned. */
export function FormActions({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("flex items-center justify-end gap-2 pt-1", className)}
			{...props}
		/>
	);
}

/** Field label inside FormItem grids. Pairs with FormMessage below. */
export function FormLabel({
	className,
	...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: wrapper component; every call site pairs it with a control.
		<label
			className={cn("text-xs font-medium text-muted-foreground", className)}
			{...props}
		/>
	);
}
