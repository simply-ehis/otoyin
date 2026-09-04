import {
	ClockIcon as Clock,
	ArrowDownTrayIcon as Download,
	MusicalNoteIcon as FileAudio2,
	ArchiveBoxIcon as Package,
	BoltIcon as Waves,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/use-toast";
import { useServerStore } from "@/stores/serverStore";

interface ExportResult {
	filename: string;
	size_bytes: number;
	duration: number;
	sample_rate: number;
	download_url: string;
}

export function LottieExportPage() {
	const { toast } = useToast();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const [audioPath, setAudioPath] = useState("");
	const [exportName, setExportName] = useState("audio");
	const [exporting, setExporting] = useState(false);
	const [result, setResult] = useState<ExportResult | null>(null);

	const handleExport = useCallback(async () => {
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
				const err = await res.json().catch((e) => {
					debug.warn("[lottie] response json failed:", e);
					return { detail: res.statusText };
				});
				throw new Error(err.detail || "Export failed");
			}
			const data: ExportResult = await res.json();
			data.download_url = `${serverUrl}${data.download_url}`;
			setResult(data);
			toast({
				title: "Export complete",
				description: `${data.filename} is ready for download.`,
			});
		} catch (err) {
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
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Package className="size-6" />
				<h1 className="text-2xl font-bold">Lottie Export</h1>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Export Settings</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="audio-path">Audio File Path</Label>
						<Input
							id="audio-path"
							value={audioPath}
							onChange={(e) => setAudioPath(e.target.value)}
							placeholder="/path/to/generated/audio.wav"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="export-name">Export Name</Label>
						<Input
							id="export-name"
							value={exportName}
							onChange={(e) => setExportName(e.target.value)}
							placeholder="audio"
						/>
					</div>
					<Button
						onClick={handleExport}
						disabled={!audioPath.trim() || exporting}
						title="Export audio for Lottie animations"
						aria-label="Export Lottie audio"
					>
						{exporting ? (
							<>
								<Spinner size="md" className="mr-1.5" />
								Exporting...
							</>
						) : (
							<>
								<FileAudio2 className="size-4 mr-1.5" />
								Export to Lottie
							</>
						)}
					</Button>
				</CardContent>
			</Card>

			{result && (
				<Card>
					<CardHeader>
						<CardTitle className="text-sm flex items-center gap-2">
							<Download className="size-4" />
							Export Result
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="text-sm">
							<span className="text-muted-foreground">File: </span>
							<code className="font-mono text-xs">{result.filename}</code>
						</div>
						<div className="flex gap-4 text-sm">
							<div className="flex items-center gap-1">
								<Clock className="w-3.5 h-3.5 text-muted-foreground" />
								<span>{result.duration.toFixed(1)}s</span>
							</div>
							<div className="flex items-center gap-1">
								<Waves className="w-3.5 h-3.5 text-muted-foreground" />
								<span>{result.sample_rate} Hz</span>
							</div>
							<div>
								<span className="text-muted-foreground">Size: </span>
								{(result.size_bytes / 1024).toFixed(1)} KB
							</div>
						</div>
						<Button asChild variant="outline" size="sm">
							<a
								href={result.download_url}
								download={result.filename}
								title="Download exported Lottie audio"
								aria-label="Download exported Lottie audio"
							>
								<Download className="w-3.5 h-3.5 mr-1.5" />
								Download
							</a>
						</Button>
					</CardContent>
				</Card>
			)}

			{!result && (
				<div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
					<Package className="size-12 opacity-30" />
					<p className="text-sm">
						Generate audio first, then export for Lottie animations
					</p>
				</div>
			)}
		</div>
	);
}

import { debug } from "../../lib/utils/debug";
