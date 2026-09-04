import {
	ChartBarIcon as BarChart3,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { SpectrogramCanvas } from "./SpectrogramCanvas";

export function SpectrogramView() {
	const { toast } = useToast();
	const [audioUrl, setAudioUrl] = useState<string | null>(null);

	const handleFilePick = useCallback(() => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "audio/*";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) {
				return;
			}
			const url = URL.createObjectURL(file);
			setAudioUrl(url);
			toast({ title: "Audio loaded", description: file.name });
		};
		input.click();
	}, [toast]);

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<BarChart3 className="size-4 text-muted-foreground" />
					<span className="text-sm font-medium text-foreground">
						Spectrogram
					</span>
				</div>
				<Button size="sm" className="h-7 text-xs" onClick={handleFilePick}>
					<Upload className="h-3.5 w-3.5 mr-1" /> Load Audio
				</Button>
			</div>

			{audioUrl ? (
				<div className="flex-1 flex flex-col gap-4">
					<div className="rounded-lg border border-border bg-card p-4">
						<div className="text-xs text-muted-foreground mb-3">
							Frequency Spectrum
						</div>
						<div className="rounded bg-sunken p-2">
							<SpectrogramCanvas
								audioUrl={audioUrl}
								height={300}
								className="rounded"
							/>
						</div>
						<div className="flex justify-between text-xs text-muted-foreground mt-2">
							<span>Low freq</span>
							<span>Time ?</span>
							<span>High freq</span>
						</div>
					</div>

					<div className="rounded-lg border border-border bg-card p-4">
						<div className="text-xs text-muted-foreground mb-2">Legend</div>
						<div className="flex items-center gap-3 text-xs">
							<div className="flex items-center gap-1">
								<div
									className="w-4 h-3 rounded"
									style={{ background: "hsl(240, 80%, 15%)" }}
								/>
								<span className="text-muted-foreground">Low energy</span>
							</div>
							<div className="flex items-center gap-1">
								<div
									className="w-4 h-3 rounded"
									style={{ background: "hsl(0, 80%, 70%)" }}
								/>
								<span className="text-muted-foreground">High energy</span>
							</div>
						</div>
					</div>
				</div>
			) : (
				<div className="flex-1 flex flex-col items-center justify-center gap-4">
					<BarChart3 className="size-12 text-muted-foreground/40" />
					<p className="text-sm text-muted-foreground text-center">
						Load an audio file to view its spectrogram
					</p>
					<Button size="sm" className="h-8 text-xs" onClick={handleFilePick}>
						<Upload className="h-3.5 w-3.5 mr-1" /> Load Audio File
					</Button>
				</div>
			)}
		</div>
	);
}
