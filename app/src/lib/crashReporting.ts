import type { ErrorInfo } from "react";
import { apiClient } from "@/lib/api/client";

const REDACTIONS: Array<[RegExp, string]> = [
	[/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
	[/\bsk-[A-Za-z0-9_-]{8,}/g, "<redacted-key>"],
	[/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted-key>"],
	[/(api[_-]?key\s*[:=]\s*['"]?)[^'"\s,}]+/gi, "$1<redacted-key>"],
	[/(?::\/\/)[^/\s:@]+:[^/\s@]+@/g, "://<credentials>@"],
	[/[A-Za-z]:\\Users\\[^\\/:"*?<>|]+/g, "<home>"],
	[/\/Users\/[^/\s]+/g, "<home>"],
	[/\/home\/[^/\s]+/g, "<home>"],
];

function scrub(text: string): string {
	let out = text || "";
	for (const [pattern, replacement] of REDACTIONS) {
		out = out.replace(pattern, replacement);
	}
	return out;
}

/**
 * Fire-and-forget crash report for ErrorBoundary catches. Never throws,
 * never blocks rendering — the backend stores it only when the user
 * opted in, and scrubs it again server-side.
 */
export function reportCrashToBackend(error: Error, info?: ErrorInfo): void {
	try {
		void apiClient.reportCrash({
			layer: "frontend",
			kind: error.name || "Error",
			message: scrub(error.message),
			stack: scrub(error.stack ?? ""),
			context: info?.componentStack
				? { componentStack: scrub(info.componentStack).slice(0, 4000) }
				: {},
		});
	} catch {
		// Reporting must never break the app further.
	}
}
