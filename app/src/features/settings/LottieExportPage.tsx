import {
	ArchiveBoxIcon,
	ArrowDownTrayIcon,
	ClockIcon,
	MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { debug } from "@/lib/utils/debug";
import { useServerStore } from "@/stores/serverStore";
import { Button } from "@/ui/button";
import { Card, CardBody, CardTitle } from "@/ui/card";
import { Field, Input } from "@/ui/input";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

interface ExportResult {
	filename: string;
	size_bytes: number;
	duration: number;
	sample_rate: number;
	download_url: string;
}

/**
 * Lottie audio export: point at a generated file, name the export,
 * download the result. Idle state explains the prerequisite.
 */
export function LottieExportPage() {
	const { toast } = useToast();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const [audioPath, setAudioPath] = useState("");
	const [exportName, setExportName] = useState("audio");
	const [exporting, setExporting] = useState(false);
	const [result, setResult] = useState<ExportResult | null>(null);

	const run = useCallback(async () => {
		if (!audioPath.trim()) {
			return;
		}
		setExporting(true);
		setResult(null);
		try {
			const res = await fetch(`${serverUrl}/export/lottie`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					audio_path: audioPath.trim(),
					name: exportName.trim(),
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch((e: unknown) => {
					debug.warn("[lottie] response json failed:", e);
					return { detail: res.statusText };
				});
				throw new Error(err.detail || "Export failed");
			}
			const data = (await res.json()) as ExportResult;
			data.download_url = `${serverUrl}${data.download_url}`;
			setResult(data);
			toast({
				title: "Export complete",
				description: `${data.filename} is ready.`,
			});
		} catch (err: unknown) {
			toast({
				title: "Export failed",
				description:
					err instanceof Error ? err.message : "Could not export audio",
				variant: "destructive",
			});
		} finally {
			setExporting(false);
		}
	}, [audioPath, exportName, serverUrl, toast]);

	return (
		<div className="flex max-w-4xl flex-col gap-6">
			<ScreenHeader title="Lottie export" />
			<Card>
				<CardTitle className="text-sm">Export settings</CardTitle>
				<CardBody className="mt-3 flex flex-col gap-4">
					<Field label="Audio file path" htmlFor="lottie-path">
						<Input
							id="lottie-path"
							value={audioPath}
							onChange={(e) => setAudioPath(e.target.value)}
							placeholder="/path/to/generated/audio.wav"
							inputMode="url"
						/>
					</Field>
					<Field label="Export name" htmlFor="lottie-name">
						<Input
							id="lottie-name"
							value={exportName}
							onChange={(e) => setExportName(e.target.value)}
							placeholder="audio"
						/>
					</Field>
					<div>
						<Button
							onClick={run}
							disabled={!audioPath.trim() || exporting}
							loading={exporting}
						>
							<MusicalNoteIcon className="mr-1.5 size-4" aria-hidden="true" />
							{exporting ? "Exporting…" : "Export to Lottie"}
						</Button>
					</div>
				</CardBody>
			</Card>

			{result ? (
				<Card>
					<CardTitle className="flex items-center gap-2 text-sm">
						<ArrowDownTrayIcon
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						Export result
					</CardTitle>
					<CardBody className="mt-3 flex flex-col gap-3">
						<p className="text-sm">
							<span className="text-muted-foreground">File: </span>
							<code className="font-mono text-xs text-foreground">
								{result.filename}
							</code>
						</p>
						<p className="flex gap-4 text-sm text-muted-foreground">
							<span className="flex items-center gap-1">
								<ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
								<span className="tabular-nums">
									{result.duration.toFixed(1)}s
								</span>
							</span>
							<span className="tabular-nums">{result.sample_rate} Hz</span>
							<span>
								Size:{" "}
								<span className="tabular-nums">
									{(result.size_bytes / 1024).toFixed(1)} KB
								</span>
							</span>
						</p>
						<div>
							<Button asChild variant="outline" size="sm">
								<a
									href={result.download_url}
									download={result.filename}
									title="Download exported Lottie audio"
									aria-label="Download exported Lottie audio"
								>
									<ArrowDownTrayIcon
										className="mr-1.5 h-3.5 w-3.5"
										aria-hidden="true"
									/>
									Download
								</a>
							</Button>
						</div>
					</CardBody>
				</Card>
			) : (
				<EmptyState
					icon={<ArchiveBoxIcon aria-hidden="true" />}
					title="Nothing exported yet"
					body="Generate audio first, then export it for Lottie animations."
				/>
			)}
		</div>
	);
}
