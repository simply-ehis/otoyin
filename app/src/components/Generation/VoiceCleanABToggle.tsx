import {
	AdjustmentsHorizontalIcon,
	PlayIcon,
	SpeakerWaveIcon,
	SpeakerXMarkIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/Spinner";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { WaveformABDiff } from "./WaveformABDiff";

interface VoiceCleanABToggleProps {
	/** Server-side audio path (e.g. from HistoryResponse.audio_path) */
	audioPath: string;
	/** TTS engine name — used to auto-select the right enhancement preset */
	engine?: string;
	/** Compact mode — renders inline without a card wrapper */
	compact?: boolean;
	className?: string;
}

/**
 * Fetches original + enhanced audio from the voice-clean A/B endpoint,
 * then renders a toggle switch so the user can flip between them
 * with instant playback — no second round-trip.
 */
export function VoiceCleanABToggle({
	audioPath,
	engine,
	compact = false,
	className,
}: VoiceCleanABToggleProps) {
	const { t } = useTranslation();

	// -- fetch state --
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fetched, setFetched] = useState(false);

	// -- audio data (base64 WAV) --
	const originalB64Ref = useRef<string | null>(null);
	const enhancedB64Ref = useRef<string | null>(null);
	const [preset, setPreset] = useState<string>("");
	const [displayEngine, setDisplayEngine] = useState<string | null>(null);

	// -- playback state --
	const [playingSide, setPlayingSide] = useState<
		"original" | "enhanced" | null
	>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const objectUrlRef = useRef<string | null>(null);

	// -- strength slider (local, re-fetches on commit) --
	const [strength, setStrength] = useState(1.0);
	const [committedStrength, setCommittedStrength] = useState(1.0);

	// -- fetch both versions on mount (or when strength changes) --
	useEffect(() => {
		let cancelled = false;

		const fetchAB = async () => {
			setLoading(true);
			setError(null);
			try {
				const result = await apiClient.voiceCleanAB(audioPath, {
					engine,
					strength: committedStrength,
				});
				if (cancelled) {
					return;
				}
				originalB64Ref.current = result.original_b64;
				enhancedB64Ref.current = result.enhanced_b64;
				setPreset(result.preset);
				setDisplayEngine(result.display_engine ?? null);
				setFetched(true);
			} catch (err) {
				if (!cancelled) {
					setError(
						err instanceof Error
							? err.message
							: "Failed to load A/B comparison",
					);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};

		fetchAB();
		return () => {
			cancelled = true;
		};
	}, [audioPath, engine, committedStrength]);

	// -- helpers --
	const b64ToBlob = useCallback((b64: string): Blob => {
		const binary = atob(b64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return new Blob([bytes], { type: "audio/wav" });
	}, []);

	const stopPlayback = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.currentTime = 0;
			audioRef.current = null;
		}
		if (objectUrlRef.current) {
			URL.revokeObjectURL(objectUrlRef.current);
			objectUrlRef.current = null;
		}
		setPlayingSide(null);
	}, []);

	const playSide = useCallback(
		(side: "original" | "enhanced") => {
			stopPlayback();
			const b64 =
				side === "original" ? originalB64Ref.current : enhancedB64Ref.current;
			if (!b64) {
				return;
			}

			const blob = b64ToBlob(b64);
			const url = URL.createObjectURL(blob);
			objectUrlRef.current = url;

			const audio = new Audio(url);
			audioRef.current = audio;
			audio.onended = () => {
				setPlayingSide(null);
				if (objectUrlRef.current) {
					URL.revokeObjectURL(objectUrlRef.current);
					objectUrlRef.current = null;
				}
			};
			audio.onerror = () => {
				setPlayingSide(null);
			};
			audio.play().catch(() => {
				setPlayingSide(null);
			});
			setPlayingSide(side);
		},
		[b64ToBlob, stopPlayback],
	);

	// -- cleanup on unmount --
	useEffect(() => {
		return () => {
			if (audioRef.current) {
				audioRef.current.pause();
				audioRef.current = null;
			}
			if (objectUrlRef.current) {
				URL.revokeObjectURL(objectUrlRef.current);
				objectUrlRef.current = null;
			}
		};
	}, []);

	// -- toggle between original ↔ enhanced --
	const [useEnhanced, setUseEnhanced] = useState(true);

	// -- waveform data (decoded once after fetch) --
	const [origB64, setOrigB64] = useState<string | null>(null);
	const [enhB64, setEnhB64] = useState<string | null>(null);

	useEffect(() => {
		if (fetched && originalB64Ref.current && enhancedB64Ref.current) {
			setOrigB64(originalB64Ref.current);
			setEnhB64(enhancedB64Ref.current);
		}
	}, [fetched]);

	const handleToggle = useCallback(
		(next: boolean) => {
			setUseEnhanced(next);
			// Auto-play the side the user just switched to
			playSide(next ? "enhanced" : "original");
		},
		[playSide],
	);

	// -- render --
	if (loading && !fetched) {
		return compact ? (
			<div
				className={cn(
					"flex items-center gap-2 text-xs text-muted-foreground",
					className,
				)}
			>
				<Spinner className="size-3" />
				{t("voiceCleanAB.loading", "Loading comparison…")}
			</div>
		) : (
			<Card className={className}>
				<CardContent className="flex items-center gap-3 p-4">
					<Spinner className="size-4" />
					<span className="text-sm text-muted-foreground">
						{t("voiceCleanAB.loading", "Loading comparison…")}
					</span>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return compact ? (
			<div className={cn("text-xs text-destructive", className)}>{error}</div>
		) : (
			<Card className={className}>
				<CardContent className="p-4">
					<p className="text-sm text-destructive">{error}</p>
				</CardContent>
			</Card>
		);
	}

	const content = (
		<div className={cn("space-y-3", !compact && "p-4")}>
			{/* Header row */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<AdjustmentsHorizontalIcon className="size-4 text-muted-foreground" />
					<span className="text-xs font-medium">
						{t("voiceCleanAB.title", "Voice Clean")}
					</span>
					{preset && (
						<span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
							{preset}
						</span>
					)}
					{displayEngine && (
						<span className="text-xs text-muted-foreground">
							({displayEngine})
						</span>
					)}
				</div>
			</div>

			{/* Toggle row — Original ↔ Enhanced */}
			<div className="flex items-center gap-3">
				<span
					className={cn(
						"text-xs font-medium transition-colors",
						!useEnhanced ? "text-foreground" : "text-muted-foreground",
					)}
				>
					<SpeakerXMarkIcon className="mr-1 inline size-3" />
					{t("voiceCleanAB.original", "Original")}
				</span>

				<Toggle
					checked={useEnhanced}
					onCheckedChange={handleToggle}
					label={t(
						"voiceCleanAB.toggleLabel",
						"Toggle between original and enhanced audio",
					)}
				/>

				<span
					className={cn(
						"text-xs font-medium transition-colors",
						useEnhanced ? "text-foreground" : "text-muted-foreground",
					)}
				>
					<SpeakerWaveIcon className="mr-1 inline size-3" />
					{t("voiceCleanAB.enhanced", "Enhanced")}
				</span>

				{/* Quick play button */}
				<Button
					variant="ghost"
					size="icon"
					className="ml-auto size-7 transition-transform hover:scale-110 active:scale-95"
					onClick={() =>
						playingSide
							? stopPlayback()
							: playSide(useEnhanced ? "enhanced" : "original")
					}
					aria-label={
						playingSide
							? t("voiceCleanAB.stop", "Stop playback")
							: t("voiceCleanAB.play", "Play current version")
					}
				>
					{playingSide ? (
						<StopIcon className="size-3.5" />
					) : (
						<PlayIcon className="size-3.5" />
					)}
				</Button>
			</div>

			{/* Waveform diff visualization */}
			{origB64 && enhB64 && (
				<WaveformABDiff
					originalB64={origB64}
					enhancedB64={enhB64}
					height={compact ? 40 : 56}
				/>
			)}

			{/* Strength slider */}
			<div className="flex items-center gap-3">
				<span className="text-xs text-muted-foreground whitespace-nowrap">
					{t("voiceCleanAB.strength", "Strength")}
				</span>
				<Slider
					min={0}
					max={1}
					step={0.05}
					value={[strength]}
					onValueChange={([v]) => setStrength(v)}
					onValueCommit={([v]) => setCommittedStrength(v)}
					className="flex-1"
					aria-label={t("voiceCleanAB.strengthAria", "Enhancement strength")}
				/>
				<span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
					{Math.round(strength * 100)}%
				</span>
			</div>
		</div>
	);

	return compact ? (
		<div className={cn("rounded-md border bg-card", className)}>{content}</div>
	) : (
		<Card className={className}>
			<CardContent className="p-0">{content}</CardContent>
		</Card>
	);
}
