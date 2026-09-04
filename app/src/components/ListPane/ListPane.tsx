import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface ListPaneProps {
	children: ReactNode;
	className?: string;
}

export const ListPane = forwardRef<HTMLDivElement, ListPaneProps>(
	({ children, className }, ref) => (
		<div
			ref={ref}
			className={cn(
				"flex flex-col h-full bg-background border-r border-border",
				className,
			)}
		>
			{children}
		</div>
	),
);
ListPane.displayName = "ListPane";

interface ListPaneHeaderProps {
	children: ReactNode;
	className?: string;
}

export const ListPaneHeader = forwardRef<HTMLDivElement, ListPaneHeaderProps>(
	({ children, className }, ref) => (
		<div
			ref={ref}
			className={cn(
				"flex flex-col gap-2 px-4 py-3 border-b border-border bg-muted/30",
				className,
			)}
		>
			{children}
		</div>
	),
);
ListPaneHeader.displayName = "ListPaneHeader";

interface ListPaneTitleRowProps {
	children: ReactNode;
	className?: string;
}

export const ListPaneTitleRow = forwardRef<
	HTMLDivElement,
	ListPaneTitleRowProps
>(({ children, className }, ref) => (
	<div
		ref={ref}
		className={cn(
			"flex items-center justify-between gap-2 flex-wrap",
			className,
		)}
	>
		{children}
	</div>
));
ListPaneTitleRow.displayName = "ListPaneTitleRow";

interface ListPaneTitleProps {
	children: ReactNode;
	className?: string;
}

export const ListPaneTitle = forwardRef<HTMLHeadingElement, ListPaneTitleProps>(
	({ children, className }, ref) => (
		<h2
			ref={ref}
			className={cn("text-base font-semibold text-foreground", className)}
		>
			{children}
		</h2>
	),
);
ListPaneTitle.displayName = "ListPaneTitle";

interface ListPaneActionsProps {
	children: ReactNode;
	className?: string;
}

export const ListPaneActions = forwardRef<HTMLDivElement, ListPaneActionsProps>(
	({ children, className }, ref) => (
		<div ref={ref} className={cn("flex items-center gap-2", className)}>
			{children}
		</div>
	),
);
ListPaneActions.displayName = "ListPaneActions";

interface ListPaneSearchProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
}

export const ListPaneSearch = forwardRef<HTMLInputElement, ListPaneSearchProps>(
	({ value, onChange, placeholder, className }, ref) => (
		<input
			ref={ref}
			type="search"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className={cn(
				"w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent",
				className,
			)}
			aria-label={placeholder}
		/>
	),
);
ListPaneSearch.displayName = "ListPaneSearch";

interface ListPaneScrollProps {
	children: ReactNode;
	className?: string;
	style?: React.CSSProperties;
}

export const ListPaneScroll = forwardRef<HTMLDivElement, ListPaneScrollProps>(
	({ children, className, style }, ref) => (
		<div
			ref={ref}
			className={cn("flex-1 overflow-y-auto overflow-x-hidden pb-4", className)}
			style={style}
		>
			{children}
		</div>
	),
);
ListPaneScroll.displayName = "ListPaneScroll";
