import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";

export function StemSeparationPage() {
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{ job_id: string; stems: Record<string, string> } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<{ demucs_available: boolean } | null>(null);

	const checkStatus = async () => {
		try {
			const r = await fetch(`${apiClient.getBaseUrl()}/stems/status`);
			setStatus(await r.json());
		} catch (e) {
			setStatus({ demucs_available: false });
		}
	};

	const separate = async () => {
		if (!file) return;
		setBusy(true);
		setError(null);
		setResult(null);
		try {
			const fd = new FormData();
			fd.append("file", file);
			const r = await fetch(`${apiClient.getBaseUrl()}/stems/separate`, {
				method: "POST",
				body: fd,
			});
			if (!r.ok) {
				const j = await r.json().catch(() => ({}));
				throw new Error(j.detail || "separation failed");
			}
			setResult(await r.json());
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="space-y-6 p-6">
			<div>
				<h2 className="text-lg font-bold tracking-tight text-foreground">
					Stem Separation (Demucs)
				</h2>
				<p className="text-sm text-muted-foreground">
					Split a song into vocals, drums, bass, and other stems.
				</p>
			</div>

			{status === null && (
				<Button size="sm" variant="outline" onClick={checkStatus}>
					Check demucs status
				</Button>
			)}
			{status && (
				<p className="text-xs text-muted-foreground">
					demucs: {status.demucs_available ? "available" : "not installed"}
				</p>
			)}

			<div className="space-y-3">
				<input
					type="file"
					accept="audio/*"
					onChange={(e) => setFile(e.target.files?.[0] ?? null)}
					className="block w-full text-sm text-muted-foreground"
				/>
				<Button size="sm" disabled={!file || busy} onClick={separate}>
					{busy ? (
						<>
							<Spinner size="xs" /> Separating…
						</>
					) : (
						"Separate stems"
					)}
				</Button>
			</div>

			{error && (
				<p className="text-sm text-destructive">{error}</p>
			)}

			{result && (
				<div className="space-y-2">
					<p className="text-sm font-medium text-foreground">
						Stems ready (job {result.job_id})
					</p>
					<ul className="space-y-1">
						{Object.entries(result.stems).map(([name, path]) => (
							<li key={name} className="text-xs text-muted-foreground">
								{name}: {path}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}