import type { GameDef } from "./types";

/**
 * Game registry — the future-game slot.
 *
 * To add a game: drop its static bundle under `app/public/game/<id>/`
 * (with its own manifest entry if it needs offline caching), then append
 * one entry here. No shell, store, or router changes needed — `GameModal`
 * and the sidebar/nudge triggers resolve everything through this list.
 */
export const GAMES: [GameDef, ...GameDef[]] = [
	{
		id: "brick-survivors",
		wordmark: "BRICK SURVIVORS",
		tagline: "— play while you generate",
		label: "Brick Survivors",
		src: "/game/game.html",
		defaultWidth: 920,
		defaultHeight: 680,
	},
	// FUTURE GAME SLOT: append the next { id, wordmark, tagline, label,
	// src, defaultWidth, defaultHeight } here. Keep ids stable once set —
	// `openGameId` in the UI store persists the selection.
];

export const DEFAULT_GAME_ID = GAMES[0].id;

export function getGame(id: string | null | undefined): GameDef {
	return GAMES.find((g) => g.id === id) ?? GAMES[0];
}
