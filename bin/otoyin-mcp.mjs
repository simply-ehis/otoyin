import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
const platform =
	process.platform === "win32"
		? "pc-windows-msvc"
		: process.platform === "darwin"
			? "apple-darwin"
			: "unknown-linux-gnu";
const suffix = process.platform === "win32" ? ".exe" : "";
const bundled = join(
	root,
	"tauri",
	"src-tauri",
	"binaries",
	`otoyin-mcp-${arch}-${platform}${suffix}`,
);
const command = existsSync(bundled) ? bundled : "otoyin-mcp";
const child = spawn(command, [], {
	env: process.env,
	stdio: "inherit",
});

child.on("error", (error) => {
	process.stderr.write(
		`otoyin-mcp: unable to start ${command}: ${error.message}\n` +
			`Build it with: just build-mcp-shim\n`,
	);
	process.exitCode = 1;
});
child.on("exit", (code, signal) => {
	process.exitCode = signal ? 1 : (code ?? 0);
});
