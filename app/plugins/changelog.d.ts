import type { Plugin } from "vite";
/** Vite plugin that exposes CHANGELOG.md as `virtual:changelog`. */
export declare function changelogPlugin(repoRoot: string): Plugin;
