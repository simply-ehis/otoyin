import {
	ArrowPathIcon,
	ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { ErrorBoundary } from "@/layouts/ErrorBoundary/ErrorBoundary";
import { Button } from "@/ui/button";

/**
 * Tab-level error boundary (design doc S8 S3): when a lazily loaded route
 * component fails to render — most commonly its chunk failing to load —
 * the sidebar and the rest of the shell keep working; only the content
 * area is replaced. The single action is "Reload tab": a full page reload,
 * because a React `lazy()` component caches the failed import promise and
 * a boundary-only retry cannot recover it.
 */
export function RouteErrorBoundary({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ErrorBoundary
			fallback={(error) => (
				<div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 p-6 text-center">
					<ExclamationCircleIcon
						className="size-8 text-muted-foreground/60"
						aria-hidden="true"
					/>
					<h3 className="text-sm font-semibold text-foreground">
						{error.title}
					</h3>
					<p className="max-w-md text-xs leading-relaxed text-muted-foreground">
						{error.message}
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => window.location.reload()}
						aria-label="Reload tab"
						title="Reload tab"
					>
						<ArrowPathIcon className="mr-2 size-3.5" aria-hidden="true" />
						Reload tab
					</Button>
				</div>
			)}
		>
			{children}
		</ErrorBoundary>
	);
}
