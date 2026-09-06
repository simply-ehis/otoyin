/**
 * A game embeddable in the app shell. Games are static bundles served from
 * `app/public/game/` and hosted in an iframe — the shell (size, chrome,
 * open state) is generic; only this definition is per-game.
 */
export interface GameDef {
	/** Stable id, persisted as the open-game selection. */
	id: string;
	/** Short uppercase wordmark shown in the modal header. */
	wordmark: string;
	/** One-line subtitle in the modal header. */
	tagline: string;
	/** aria-label for the dialog + iframe title. */
	label: string;
	/** Iframe source, relative to the app root. */
	src: string;
	/** Default modal size in px (clamped to the viewport). */
	defaultWidth: number;
	defaultHeight: number;
}
