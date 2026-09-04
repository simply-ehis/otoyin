import { useCallback, useRef, useState } from "react";
import { useToast } from "@/ui/use-toast";
import { registerFileSource } from "@/lib/audio/sources";
import {
	ERR_DESC_PLAYBACK_FAILED,
	ERR_TITLE_PLAYBACK,
} from "@/lib/errorMessages";
import { usePlayerStore } from "@/stores/playerStore";

let sharedContext: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let contextInitialized = false;

function initSharedContext(): AudioContext | null {
	if (typeof window === "undefined") {
		return null;
	}
	if (!contextInitialized) {
		const Ctx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext })
				.webkitAudioContext;
		if (!Ctx) {
			return null;
		}
		sharedContext = new Ctx();
		sharedAnalyser = sharedContext.createAnalyser();
		sharedAnalyser.fftSize = 2048;
		sharedAnalyser.smoothingTimeConstant = 0.8;
		contextInitialized = true;

		// Close on page unload
		window.addEventListener("beforeunload", () => {
			if (sharedContext && sharedContext.state !== "closed") {
				sharedContext.close();
			}
		});
	}
	return sharedContext;
}

function getSharedAnalyser(): AnalyserNode | null {
	if (typeof window === "undefined") {
		return null;
	}
	initSharedContext();
	return sharedAnalyser;
}

export function getSharedContext(): AudioContext | null {
	if (typeof window === "undefined") {
		return null;
	}
	return initSharedContext();
}

// Ensure context is created on first user interaction
if (typeof window !== "undefined" && !contextInitialized) {
	const initOnGesture = () => {
		initSharedContext();
		window.removeEventListener("pointerdown", initOnGesture);
		window.removeEventListener("keydown", initOnGesture);
	};
	window.addEventListener("pointerdown", initOnGesture, { once: true });
	window.addEventListener("keydown", initOnGesture, { once: true });
}

export function useAudioPlayer() {
	const [isPlaying, setIsPlaying] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const blobUrlRef = useRef<string | null>(null);
	const { toast } = useToast();

	const clearAnalyser = useCallback(() => {
		const current = usePlayerStore.getState().masterAnalyser;
		if (current && current === sharedAnalyser) {
			usePlayerStore.getState().setMasterAnalyser(null);
		}
	}, []);

	const playPause = useCallback(
		(file: File | null | undefined) => {
			if (!file) {
				return;
			}

			if (audioRef.current) {
				if (isPlaying) {
					audioRef.current.pause();
					setIsPlaying(false);
				} else {
					audioRef.current.play();
					setIsPlaying(true);
				}
			} else {
				if (blobUrlRef.current) {
					URL.revokeObjectURL(blobUrlRef.current);
					blobUrlRef.current = null;
				}

				const audio = new Audio();
				const url = URL.createObjectURL(file);
				blobUrlRef.current = url;
				audio.src = url;
				audioRef.current = audio;

				const analyser = getSharedAnalyser();
				if (analyser && sharedContext) {
					try {
						const source = sharedContext.createMediaElementSource(audio);
						source.connect(analyser);
						analyser.connect(sharedContext.destination);
						usePlayerStore.getState().setMasterAnalyser(analyser);
					} catch {
						// MediaElementSource can only be created once per element; ignore if unavailable.
					}
				}

				// Register this playback as a routable bus source so other tabs
				// (Audio Studio monitor, Video tab) can listen to it live.
				const reg = registerFileSource(url, { label: "Voiceover" });
				if (reg) {
					audio.addEventListener("ended", () => reg.unregister(), {
						once: true,
					});
				}

				audio.addEventListener("ended", () => {
					if (blobUrlRef.current) {
						URL.revokeObjectURL(blobUrlRef.current);
						blobUrlRef.current = null;
					}
					audioRef.current = null;
					setIsPlaying(false);
					clearAnalyser();
				});

				audio.addEventListener("error", () => {
					setIsPlaying(false);
					clearAnalyser();
					toast({
						title: ERR_TITLE_PLAYBACK,
						description: ERR_DESC_PLAYBACK_FAILED,
						variant: "destructive",
					});
					if (blobUrlRef.current) {
						URL.revokeObjectURL(blobUrlRef.current);
						blobUrlRef.current = null;
					}
					audioRef.current = null;
				});

				audio.play();
				setIsPlaying(true);
			}
		},
		[isPlaying, toast, clearAnalyser],
	);

	const cleanup = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.removeAttribute("src");
			audioRef.current.load();
			audioRef.current = null;
		}
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
		}
		setIsPlaying(false);
		clearAnalyser();
	}, [clearAnalyser]);

	return {
		isPlaying,
		playPause,
		cleanup,
	};
}
