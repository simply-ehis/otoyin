import { useState } from "react";
import { Button } from "@/ui/button";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { SpectrogramCanvas } from "./spectrogram/SpectrogramCanvas";
import { UploadField } from "./UploadField";

export function SpectrogramView() {
	const { toast } = useToast();
	const [audioUrl, setAudioUrl] = useState<string | null>(null);
	const [fileName, setFileName] = useState("");

	function handleFile(file: File) {
		if (audioUrl?.startsWith("blob:")) {
			URL.revokeObjectURL(audioUrl);
		}
		setAudioUrl(URL.createObjectURL(file));
		setFileName(file.name);
		toast({ title: "Audio loaded", description: file.name });
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4 overflow-hidden">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<ScreenHeader title="Spectrogram" />
				<UploadField
					id="spec-upload"
					label="Load Audio"
					fileName={fileName}
					uploading={false}
					onFile={handleFile}
				/>
			</div>

			{audioUrl ? (
				<div className="flex min-h-0 flex-1 flex-col gap-4">
					<section className="rounded-md border border-border bg-card p-4">
						<h2 className="mb-3 text-xs text-muted-foreground">
							Frequency spectrum
						</h2>
						<div className="rounded-md bg-sunken p-2">
							<SpectrogramCanvas
								audioUrl={audioUrl}
								height={300}
								className="rounded-sm"
							/>
						</div>
						<div className="mt-2 flex justify-between text-xs text-muted-foreground">
							<span>Low freq</span>
							<span>Time →</span>
							<span>High freq</span>
						</div>
					</section>

					<section className="rounded-md border border-border bg-card p-4">
						<h2 className="mb-2 text-xs text-muted-foreground">Legend</h2>
						<div className="flex items-center gap-3 text-xs">
							<span className="flex items-center gap-1">
								<span
									aria-hidden="true"
									className="h-3 w-4 rounded-sm"
									style={{ background: "hsl(240, 80%, 15%)" }}
								/>
								<span className="text-muted-foreground">Low energy</span>
							</span>
							<span className="flex items-center gap-1">
								<span
									aria-hidden="true"
									className="h-3 w-4 rounded-sm"
									style={{ background: "hsl(0, 80%, 70%)" }}
								/>
								<span className="text-muted-foreground">High energy</span>
							</span>
						</div>
					</section>
				</div>
			) : (
				<div className="flex flex-1 flex-col items-center justify-center gap-4">
					<EmptyState
						title="Load audio to view its spectrogram"
						body="Any local audio file works — it never leaves your machine."
						action={
							<Button type="button" size="sm" variant="outline" asChild>
								<label htmlFor="spec-upload">Load Audio File</label>
							</Button>
						}
					/>
				</div>
			)}
		</div>
	);
}
