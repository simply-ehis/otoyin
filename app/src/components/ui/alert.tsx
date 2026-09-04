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
			"bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800",
		warning:
			"bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800",
		info: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
		success:
			"bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800",
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
