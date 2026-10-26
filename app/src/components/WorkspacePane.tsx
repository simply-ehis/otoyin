import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";

interface Props {
	open: boolean;
	onClose: () => void;
	title?: string;
	side?: "left" | "right";
	children: ReactNode;
}

export function WorkspacePane({
	open,
	onClose,
	title,
	side = "right",
	children,
}: Props) {
	useEffect(() => {
		if (!open) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	return (
		<div
			className={cn(
				"fixed inset-y-0 z-40 w-80 max-w-[90vw] transform bg-background shadow-xl transition-transform duration-200",
				side === "right" ? "right-0" : "left-0",
				open
					? "translate-x-0"
					: side === "right"
						? "translate-x-full"
						: "-translate-x-full",
			)}
			aria-hidden={!open}
		>
			<div className="flex h-full flex-col">
				<header className="flex items-center justify-between border-b border-border px-4 py-3">
					<span className="text-sm font-medium">{title ?? "Panel"}</span>
					<Button
						size="sm"
						variant="ghost"
						onClick={onClose}
						aria-label="Close panel"
					>
						<XMarkIcon className="size-4" />
					</Button>
				</header>
				<div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
			</div>
		</div>
	);
}

export default WorkspacePane;
