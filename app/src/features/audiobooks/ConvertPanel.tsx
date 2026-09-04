import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";

/**
 * Audio format conversion: rendered WAV → mp3/m4a/m4b/flac/ogg/opus
 * via server ffmpeg. Disabled with explanation when ffmpeg is absent.
 */
export function ConvertPanel() {
	const [formats, setFormats] = useState<Record<string, { ext: string; mime: string }>>({});
	const [ffmpeg, setFfmpeg] = useState<boolean | null>(null);
	const [audioPath, setAudioPath] = useState("");
	const [target, setTarget] = useState("mp3");
	const [busy, setBusy] = useState(false);
	const [out, setOut] = useState<string | null>(null);

	useEffect(() => {
		apiClient
			.listFormats()
			.then((r) => {
				setFormats(r.formats);
				setFfmpeg(r.ffmpeg_available);
			})
			.catch(() => setFfmpeg(false));
	}, []);

	const convert = async () => {
		if (!audioPath.trim()) {
			showStudioErrorToast(new Error("Enter audio_path (e.g. generations/xxx.wav)"));
			return;
		}
		setBusy(true);
		setOut(null);
		try {
			const r = await apiClient.convertAudio(audioPath.trim(), target);
			setOut(r.output_path);
		} catch (e: unknown) {
			showStudioErrorToast(e);
		} finally {
			setBusy(false);
		}
	};

	const names = Object.keys(formats);

	return (
		<section
			aria-label="Audio format conversion"
			className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
		>
			<h3 className="text-sm font-medium text-foreground">Audio format conversion</h3>
			<p className="text-xs leading-relaxed text-muted-foreground">
				WAV is default. Convert any rendered file via ffmpeg.{" "}
				{ffmpeg === false ? (
					<span className="text-destructive">— ffmpeg not found</span>
				) : null}
			</p>
			<div className="flex gap-2">
				<Field label="Audio path" htmlFor="convert-path" className="flex-1">
					<Input
						id="convert-path"
						placeholder="audio_path (from chapter or generation)"
						value={audioPath}
						onChange={(e) => setAudioPath(e.target.value)}
					/>
				</Field>
				<Field label="Format" htmlFor="convert-target" className="w-28 shrink-0">
					<Select value={target} onValueChange={setTarget}>
						<SelectTrigger id="convert-target">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{names.length > 0
								? names.map((f) => (
										<SelectItem key={f} value={f}>
											{f}
										</SelectItem>
									))
								: ["mp3", "m4a", "m4b", "flac"].map((f) => (
										<SelectItem key={f} value={f}>
											{f}
										</SelectItem>
									))}
						</SelectContent>
					</Select>
				</Field>
				<span className="flex items-end">
					<Button onClick={convert} disabled={busy || ffmpeg === false} loading={busy}>
						{busy ? "Converting…" : "Convert"}
					</Button>
				</span>
			</div>
			{out ? (
				<p className="text-xs text-success" role="status">
					Done → {out}
				</p>
			) : null}
		</section>
	);
}
