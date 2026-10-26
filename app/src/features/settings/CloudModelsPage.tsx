import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";

const STORAGE_KEY = "otoyin.cloud.subscriptionKey";

export function getCloudSubscriptionKey(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? "";
	} catch {
		return "";
	}
}

export function setCloudSubscriptionKey(key: string): void {
	try {
		if (key) localStorage.setItem(STORAGE_KEY, key);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* ignore */
	}
}

export function CloudModelsPage() {
	const [key, setKey] = useState(getCloudSubscriptionKey());
	const [status, setStatus] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const save = () => {
		setCloudSubscriptionKey(key.trim());
		setStatus("Saved.");
	};

	const check = async () => {
		setBusy(true);
		setStatus(null);
		try {
			const res = await apiClient.cloudStatus(key.trim() || undefined);
			setStatus(
				res.router_configured
					? "Connected — cloud router reachable."
					: "Router not configured on backend.",
			);
		} catch (e) {
			setStatus(`Error: ${(e as Error).message}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="space-y-6 p-6">
			<div>
				<h2 className="text-lg font-bold tracking-tight text-foreground">
					Cloud models
				</h2>
				<p className="text-sm text-muted-foreground">
					Premium LLM &amp; TTS routed through your cloud router. Requires a
					subscription key.
				</p>
			</div>

			<div className="space-y-3">
				<Field label="Subscription key">
					<Input
						type="password"
						value={key}
						onChange={(e) => setKey(e.target.value)}
						placeholder="sk-…"
					/>
				</Field>
				<div className="flex gap-2">
					<Button size="sm" onClick={save}>
						Save
					</Button>
					<Button size="sm" variant="outline" disabled={busy} onClick={check}>
						{busy ? "Checking…" : "Test connection"}
					</Button>
				</div>
				{status && (
					<p className="text-xs text-muted-foreground">{status}</p>
				)}
			</div>

			<div className="rounded-lg border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
				Set <code>CLOUD_ROUTER_URL</code> and <code>CLOUD_ROUTER_API_KEY</code>{" "}
				on the backend. Optionally restrict keys via{" "}
				<code>CLOUD_ALLOWED_KEYS</code>.
			</div>
		</div>
	);
}