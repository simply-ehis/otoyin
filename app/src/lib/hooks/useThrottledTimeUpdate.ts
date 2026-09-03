import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a throttled version of `setTime` that coalesces rapid calls
 * (e.g. WaveSurfer's 60fps `timeupdate`) into at most one `set()` per
 * animation frame. The store only sees ~60 commits/sec max instead of
 * potentially many more, cutting wasted re-renders of all subscriber
 * components (Sidebar, AudioPlayer, StudioVisualizer, etc.) by a large
 * margin without any visible latency increase.
 *
 * Flushes any pending value on unmount so the store ends at the correct
 * final time.
 */
export function useThrottledTimeUpdate(
	setTime: (t: number) => void,
): (t: number) => void {
	const rafRef = useRef(0);
	const pendingRef = useRef(0);

	// Flush pending value on unmount.
	useEffect(() => {
		return () => {
			if (rafRef.current !== 0) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = 0;
				setTime(pendingRef.current);
			}
		};
	}, [setTime]);

	const throttled = useCallback(
		(time: number) => {
			pendingRef.current = time;
			if (rafRef.current === 0) {
				rafRef.current = requestAnimationFrame(() => {
					rafRef.current = 0;
					setTime(pendingRef.current);
				});
			}
		},
		[setTime],
	);

	return throttled;
}
