import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { loadDraft, saveDraft } from "@/lib/drafts";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";

const SAVE_DEBOUNCE_MS = 250;

/**
 * Wire a generation form to its persisted draft. Call on every render of the
 * composer/prompt-bar component. Mounts exactly once; subsequent renders only
 * re-run the debounce timer while text changes.
 *
 * Semantics:
 * - on mount: if `text` is empty and a draft exists, restore it
 * - on every text change (including restore): debounce-write to storage
 * - clearing: call {@link clearDraft} directly (success path) or let the
 *   component call it explicitly — this hook never wipes on unmount
 */
export function usePersistentDraft(
	key: string,
	form: UseFormReturn<GenerationFormValues>,
): void {
	const restoredRef = useRef(false);
	const text = form.watch("text") ?? "";

	// Restore once on mount. Never on remount if the component state already
	// has text (e.g. hot-module reload during dev).
	// biome-ignore lint/correctness/useExhaustiveDependencies: restore must run exactly once; it must not re-fire when form handle identity changes
	useEffect(() => {
		if (restoredRef.current) {
			return;
		}
		restoredRef.current = true;
		const draft = loadDraft(key);
		if (draft && !form.getValues("text")) {
			form.setValue("text", draft, { shouldDirty: true });
		}
	}, [key]);

	// Debounced save; deleting when empty so an accidental empty-save doesn't
	// resurrect an already-cleared draft.
	useEffect(() => {
		const handle = window.setTimeout(() => {
			saveDraft(key, text);
		}, SAVE_DEBOUNCE_MS);
		return () => window.clearTimeout(handle);
	}, [key, text]);
}
