import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

/** Tabs that can be deep-linked via `?search=` handoff params. */
export type SendToTarget =
	| "/effects"
	| "/vocal-isolation"
	| "/transcript"
	| "/noise-reduction"
	| "/audio-enhance";

/**
 * Shared "Send to…" handoff: navigates to a target tab carrying a small
 * reference in the URL search params (e.g. `?generation=<id>` or `?path=<storage_path>`).
 * The target tab reads the param on mount and loads/previews the file.
 */
export function useSendTo() {
	const navigate = useNavigate();
	return useCallback(
		(to: SendToTarget, search: Record<string, string | undefined>) => {
			void navigate({ to, search } as never);
		},
		[navigate],
	);
}
