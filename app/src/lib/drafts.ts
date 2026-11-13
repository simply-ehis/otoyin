/**
 * Composer draft persistence — survive an accidental window close with
 * half-typed script text instead of losing it.
 *
 * Drafts are stored under a fixed prefix in localStorage so they're
 * trivial to clear ("Clear history"-style wipes should not need to know the
 * keys). Values are tiny strings; no versioning needed.
 */
const PREFIX = "otoyin:draft:";

/** Read a draft. Returns "" on missing/corrupt/unavailable storage. */
export function loadDraft(key: string): string {
	try {
		return localStorage.getItem(`${PREFIX}${key}`) ?? "";
	} catch {
		return "";
	}
}

/** Save a draft. Empty string deletes the entry. */
export function saveDraft(key: string, value: string): void {
	try {
		if (!value) {
			localStorage.removeItem(`${PREFIX}${key}`);
			return;
		}
		localStorage.setItem(`${PREFIX}${key}`, value);
	} catch {
		// Storage full / disabled — silently skip persistence.
	}
}

/** Drop a draft (after successful submit, explicit clear, etc.). */
export function clearDraft(key: string): void {
	saveDraft(key, "");
}
