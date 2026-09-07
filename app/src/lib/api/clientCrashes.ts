import { ClientPrivacyMethods } from "./clientPrivacy";

export interface CrashReportInput {
	layer?: "frontend" | "rust" | "backend";
	kind?: string;
	message?: string;
	stack?: string;
	context?: Record<string, unknown>;
}

export interface CrashStatus {
	enabled: boolean;
	reports_stored_total: number;
	reports_forwarded_total: number;
	last_sent: string;
	remote_configured: boolean;
}

export interface LocalCrashReport {
	id: string;
	timestamp: string;
	layer: string;
	kind: string;
	message: string;
	stack: string;
	context: Record<string, unknown>;
	forwarded?: boolean;
}

/**
 * Crash-reporting client. Reports are accepted by the backend only when
 * the user opted in (otherwise `{stored: false}`) — callers never need
 * to check the toggle themselves, and failures are always silent:
 * a broken reporter must never break the app further.
 */
export class CrashesMethods extends ClientPrivacyMethods {
	async getCrashStatus(): Promise<CrashStatus> {
		return this.request<CrashStatus>("/crashes/status");
	}

	async toggleCrashReporting(enabled: boolean): Promise<CrashStatus> {
		return this.request<CrashStatus>("/crashes/toggle", {
			method: "POST",
			body: JSON.stringify({ enabled }),
		});
	}

	async getCrashReports(limit = 100): Promise<{ reports: LocalCrashReport[] }> {
		return this.request<{ reports: LocalCrashReport[] }>(
			`/crashes/events?limit=${limit}`,
		);
	}

	async clearCrashReports(): Promise<{ removed: number }> {
		return this.request<{ removed: number }>("/crashes/events", {
			method: "DELETE",
		});
	}

	async reportCrash(input: CrashReportInput): Promise<{ stored: boolean; id: string | null }> {
		try {
			return await this.request<{ stored: boolean; id: string | null }>(
				"/crashes/report",
				{
					method: "POST",
					body: JSON.stringify({
						layer: input.layer ?? "frontend",
						kind: (input.kind ?? "Error").slice(0, 120),
						message: (input.message ?? "").slice(0, 2000),
						stack: (input.stack ?? "").slice(0, 20000),
						context: input.context ?? {},
					}),
				},
				8000,
			);
		} catch {
			return { stored: false, id: null };
		}
	}
}
