import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import { InteractiveWaveform } from "./InteractiveWaveform";

interface StemInfo {
	name: string;
	fname: string;
	peaks?: number[];
	gain: number;
	muted: boolean;
}

export function StemSeparationPanel() {
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{
		job_id: string;
		stems: Record<string, string>;
	} | null>(null);
	const [stems, setStems] = useState<StemInfo[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<{
		demucs_available: boolean;
		model_cached?: boolean;
	} | null>(null);
	const [vocalSplit, setVocalSplit] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [beats, setBeats] = useState<number[]>([]);
	const [bpm, setBpm] = useState(0);
	const [mixing, setMixing] = useState(false);
	const [mixFile, setMixFile] = useState<string | null>(null);
	const [splitting, setSplitting] = useState(false);

	const baseUrl = apiClient.getBaseUrl();

	const checkStatus = async () => {
		try {
			const r = await fetch(`${baseUrl}/stems/status`);
			setStatus(await r.json());
		} catch {
			setStatus({ demucs_available: false });
		}
	};

	const computePeaks = async (url: string): Promise<number[]> => {
		try {
			const res = await fetch(url);
			const buf = await res.arrayBuffer();
			const win = window as unknown as {
				webkitAudioContext?: typeof AudioContext;
			};
			const AudioCtx = window.AudioContext ?? win.webkitAudioContext;
			const ctx = new AudioCtx();
			const audio = await ctx.decodeAudioData(buf);
			const data = audio.getChannelData(0);
			const numBars = 120;
			const step = Math.floor(data.length / numBars);
			const peaks: number[] = [];
			for (let i = 0; i < numBars; i++) {
				let max = 0;
				for (let j = 0; j < step; j++) {
					const v = Math.abs(data[i * step + j] || 0);
					if (v > max) {
						max = v;
					}
				}
				peaks.push(max);
			}
			await ctx.close();
			return peaks;
		} catch {
			return [];
		}
	};

	const separate = async () => {
		if (!file) {
			return;
		}
		setBusy(true);
		setError(null);
		setResult(null);
		setStems([]);
		try {
			const fd = new FormData();
			fd.append("file", file);
			const r = await fetch(`${baseUrl}/stems/separate`, {
				method: "POST",
				body: fd,
			});
			if (!r.ok) {
				const j = await r.json().catch(() => ({}));
				throw new Error(j.detail || "separation failed");
			}
			const res = await r.json();
			setResult(res);
			// fetch beats
			try {
				const br = await fetch(`${baseUrl}/stems/${res.job_id}/beats`);
				if (br.ok) {
					const bj = await br.json();
					setBeats(bj.beats || []);
					setBpm(bj.bpm_estimate || 0);
				}
			} catch {
				/* ignore */
			}
			const stemList: StemInfo[] = [];
			for (const [name, fname] of Object.entries(
				res.stems as Record<string, string>,
			)) {
				const url = `${baseUrl}/stems/${res.job_id}/${fname}`;
				const peaks = await computePeaks(url);
				stemList.push({ name, fname, peaks, gain: 1, muted: false });
			}
			setStems(stemList);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const splitVocals = async () => {
		if (!result) {
			return;
		}
		setSplitting(true);
		try {
			const r = await fetch(`${baseUrl}/stems/${result.job_id}/vocal-split`, {
				method: "POST",
			});
			if (!r.ok) {
				throw new Error("vocal split failed");
			}
			const j = await r.json();
			const newStems: StemInfo[] = [];
			for (const [name, fname] of Object.entries(
				j.stems as Record<string, string>,
			)) {
				const url = `${baseUrl}/stems/${result.job_id}/${fname}`;
				const peaks = await computePeaks(url);
				newStems.push({ name, fname, peaks, gain: 1, muted: false });
			}
			setStems((prev) => [...prev, ...newStems]);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setSplitting(false);
		}
	};

	const mixdown = async () => {
		if (!result) {
			return;
		}
		setMixing(true);
		try {
			const r = await fetch(`${baseUrl}/stems/${result.job_id}/mixdown`, {
				method: "POST",
			});
			if (!r.ok) {
				throw new Error("mixdown failed");
			}
			const j = await r.json();
			setMixFile(j.file);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setMixing(false);
		}
	};

	const toggleMute = (name: string) => {
		setStems((prev) =>
			prev.map((s) => (s.name === name ? { ...s, muted: !s.muted } : s)),
		);
	};

	const setGain = (name: string, gain: number) => {
		setStems((prev) => prev.map((s) => (s.name === name ? { ...s, gain } : s)));
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
					demucs: {status.demucs_available ? "available" : "not installed"}{" "}
					{status.model_cached !== undefined &&
						`· model ${status.model_cached ? "cached" : "not downloaded"}`}
				</p>
			)}

			<div className="space-y-3">
				<input
					type="file"
					accept="audio/*"
					onChange={(e) => setFile(e.target.files?.[0] ?? null)}
					className="block w-full text-sm text-muted-foreground"
				/>
				<div className="flex gap-2">
					<Button size="sm" disabled={!file || busy} onClick={separate}>
						{busy ? (
							<>
								<Spinner size="xs" /> Separating…
							</>
						) : (
							"Separate stems"
						)}
					</Button>
					<label className="flex items-center gap-1 text-xs text-muted-foreground">
						<input
							type="checkbox"
							checked={vocalSplit}
							onChange={(e) => setVocalSplit(e.target.checked)}
						/>
						Split vocals (lead/backing)
					</label>
					{result &&
						stems.some((s) => s.name === "vocals") &&
						!stems.some((s) => s.name === "lead_vocals") && (
							<Button
								size="sm"
								variant="outline"
								disabled={splitting}
								onClick={splitVocals}
							>
								{splitting ? "Splitting…" : "Split vocals"}
							</Button>
						)}
					{result && (
						<Button
							size="sm"
							variant="outline"
							disabled={mixing}
							onClick={mixdown}
						>
							{mixing ? "Mixing…" : "Mixdown"}
						</Button>
					)}
				</div>
			</div>

			{error && <p className="text-sm text-destructive">{error}</p>}

			{result && stems.length > 0 && (
				<div className="space-y-4">
					<p className="text-sm font-medium text-foreground">
						Stems ready (job {result.job_id}) — zoom {zoom}x (scroll to zoom)
					</p>
					{stems.map((s) => (
						<div
							key={s.name}
							className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-2"
						>
							<span className="w-20 text-sm font-medium text-foreground capitalize">
								{s.name}
							</span>
							<InteractiveWaveform
								peaks={s.peaks || []}
								color={s.muted ? "#666" : "#a78bfa"}
								muted={s.muted}
								zoom={zoom}
								onZoomChange={setZoom}
							/>
							<input
								type="range"
								min={0}
								max={2}
								step={0.01}
								value={s.gain}
								onChange={(e) => setGain(s.name, parseFloat(e.target.value))}
								className="w-24"
								disabled={s.muted}
							/>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => toggleMute(s.name)}
							>
								{s.muted ? "Unmute" : "Mute"}
							</Button>
							<a
								href={`${baseUrl}/stems/${result.job_id}/${s.fname}`}
								download={s.fname}
								className="text-xs text-primary underline"
							>
								Download
							</a>
						</div>
					))}
					{mixFile && result && (
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium text-foreground">
								Mixdown:
							</span>
							<audio
								controls
								src={`${baseUrl}/stems/${result.job_id}/${mixFile}`}
								className="h-8"
							>
								<track kind="captions" label="Captions" src="" />
							</audio>
							<a
								href={`${baseUrl}/stems/${result.job_id}/${mixFile}`}
								download={mixFile}
								className="text-xs text-primary underline"
							>
								Download mix
							</a>
						</div>
					)}
					{beats.length > 0 && (
						<div className="space-y-1">
							<p className="text-xs text-muted-foreground">
								Beats: {beats.length} detected — ~{bpm} BPM
							</p>
							<div className="relative h-6 rounded bg-secondary/40">
								{beats.map((b) => (
									<div
										key={b}
										className="absolute top-0 h-full w-px bg-primary"
										style={{ left: `${(b / Math.max(...beats, 1)) * 100}%` }}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function StemSeparationPage() {
	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<StemSeparationPanel />
		</div>
	);
}
