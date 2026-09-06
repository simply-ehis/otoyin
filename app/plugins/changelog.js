import { readFileSync } from "node:fs";
import path from "node:path";
/** Vite plugin that exposes CHANGELOG.md as `virtual:changelog`. */
export function changelogPlugin(repoRoot) {
    var virtualId = "virtual:changelog";
    var resolvedId = "\0".concat(virtualId);
    var changelogPath = path.resolve(repoRoot, "CHANGELOG.md");
    return {
        name: "changelog",
        resolveId: function (id) {
            if (id === virtualId)
                return resolvedId;
        },
        load: function (id) {
            if (id === resolvedId) {
                var raw = readFileSync(changelogPath, "utf-8");
                return "export default ".concat(JSON.stringify(raw), ";");
            }
        },
    };
}
