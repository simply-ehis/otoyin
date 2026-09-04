import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";

export function ConvertPanel() {
	const [formats, setFormats] = useState<
		Record<string, { ext: string; mime: string }>
	>({});
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

	async function convert() {
		if (!audioPath) {
			showStudioErrorToast(
				new Error("Enter audio_path (e.g. generations/xxx.wav)"),
			);
			return;
		}
		setBusy(true);
		setOut(null);
		try {
			const r = await apiClient.convertAudio(audioPath, target);
			setOut(r.output_path);
		} catch (e) {
			showStudioErrorToast(e);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="border rounded-lg p-3 bg-card space-y-2">
			<div className="text-sm font-medium">
				Audio Format Conversion (same tab)
			</div>
			<div className="text-xs text-muted-foreground">
				WAV is default. Convert any rendered file to mp3/m4a/m4b/flac/ogg/opus
				via ffmpeg{" "}
				{ffmpeg === false && (
					<span className="text-destructive">— ffmpeg not found</span>
				)}
			</div>
			<div className="flex gap-2">
				<input
					placeholder="audio_path (from chapter or generation)"
					value={audioPath}
					onChange={(e) => setAudioPath(e.target.value)}
					className="flex-1 px-2 py-1 rounded border bg-background text-sm"
				/>
				<select
					value={target}
					onChange={(e) => setTarget(e.target.value)}
					className="px-2 py-1 rounded border bg-background text-sm"
				>
					{Object.keys(formats).map((f) => (
						<option key={f} value={f}>
							{f}
						</option>
					))}
					{Object.keys(formats).length === 0 && (
						<>
							<option value="mp3">mp3</option>
							<option value="m4a">m4a</option>
							<option value="m4b">m4b</option>
							<option value="flac">flac</option>
						</>
					)}
				</select>
				<button
					type="button"
					onClick={convert}
					disabled={busy || ffmpeg === false}
					className="px-3 py-1 rounded bg-secondary text-sm disabled:opacity-50"
					title="Convert audio format"
				>
					{busy ? "Converting…" : "Convert"}
				</button>
			</div>
			{out && <div className="text-xs text-green-600">Done → {out}</div>}
		</div>
	);
}
