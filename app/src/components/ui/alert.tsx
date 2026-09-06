import { XMarkIcon as X } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

interface AlertProps {
	message?: string;
	variant?: "destructive" | "warning" | "info" | "success";
	onDismiss?: () => void;
	className?: string;
	children?: ReactNode;
}

export function Alert({
	message,
	variant = "destructive",
	onDismiss,
	className,
	children,
}: AlertProps) {
	const baseStyles =
		"flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium";
	const variantStyles = {
		destructive:
			"border border-destructive/40 bg-danger-soft text-danger-text",
		warning: "border border-warning/40 bg-warning-soft text-warning-text",
		info: "border border-info/40 bg-info-soft text-info-text",
		success: "border border-success/40 bg-success-soft text-success-text",
	};

	const content = children ?? message;

	if (!content) {
		return null;
	}

	return (
		<div
			className={`${baseStyles} ${variantStyles[variant]} border ${className}`}
			role="alert"
		>
			<span className="flex-1">{children ?? message}</span>
			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					className="flex-shrink-0 p-1 rounded hover:bg-secondary transition-colors"
					aria-label="Dismiss"
				>
					<X className="w-4 h-4 opacity-60 hover:opacity-100" />
				</button>
			)}
		</div>
	);
}
