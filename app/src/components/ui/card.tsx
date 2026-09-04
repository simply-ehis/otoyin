import type * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Card({
	ref,
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement> & {
	ref?: React.Ref<HTMLDivElement>;
}) {
	return (
		<div
			ref={ref}
			className={cn("panel text-card-foreground overflow-hidden", className)}
			{...props}
		/>
	);
}

export function CardHeader({
	ref,
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement> & {
	ref?: React.Ref<HTMLDivElement>;
}) {
	return (
		<div
			ref={ref}
			className={cn("flex flex-col space-y-1.5 p-6", className)}
			{...props}
		/>
	);
}

export function CardTitle({
	ref,
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement> & {
	ref?: React.Ref<HTMLParagraphElement>;
}) {
	return (
		<h3
			ref={ref}
			className={cn(
				"text-2xl font-semibold leading-none tracking-tighter font-geist",
				className,
			)}
			{...props}
		/>
	);
}

export function CardDescription({
	ref,
	className,
	...props
}: React.HTMLAttributes<HTMLParagraphElement> & {
	ref?: React.Ref<HTMLParagraphElement>;
}) {
	return (
		<p
			ref={ref}
			className={cn("text-sm text-muted-foreground leading-relaxed", className)}
			{...props}
		/>
	);
}

export function CardContent({
	ref,
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement> & {
	ref?: React.Ref<HTMLDivElement>;
}) {
	return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({
	ref,
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement> & {
	ref?: React.Ref<HTMLDivElement>;
}) {
	return (
		<div
			ref={ref}
			className={cn("flex items-center p-6 pt-0", className)}
			{...props}
		/>
	);
}
