/**
 * Route-level dynamic import with one retry (design doc S8 S3).
 *
 * A failed chunk fetch — transient disk error, service restart mid-load —
 * gets exactly one more attempt after a short delay before the error
 * reaches the route boundary. The original error is rethrown when the
 * retry also fails, so the boundary can offer "Reload tab".
 */
import { type ComponentType, type LazyExoticComponent, lazy } from "react";

const RETRY_DELAY_MS = 150;

// Mirrors the signature React's own `lazy` uses (`ComponentType<any>`): the
// factory's component is preserved as-is and callers infer props from it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<C extends ComponentType<any>>(
	factory: () => Promise<{ default: C }>,
): LazyExoticComponent<C> {
	return lazy(() =>
		factory().catch(async (err: unknown) => {
			await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
			try {
				return await factory();
			} catch {
				throw err;
			}
		}),
	);
}
