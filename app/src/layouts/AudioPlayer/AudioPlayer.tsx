import {
	PauseIcon as Pause,
	PlayIcon as Play,
	ArrowUturnLeftIcon as Repeat,
	SpeakerWaveIcon as Volume2,
	SpeakerXMarkIcon as VolumeX,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Slider } from "@/ui/slider";
import { apiClient } from "@/lib/api/client";
import { useThrottledTimeUpdate } from "@/lib/hooks/useThrottledTimeUpdate";
import { formatAudioDuration } from "@/lib/utils/audio";
import { debug } from "@/lib/utils/debug";
import { usePlatform } from "@/platform/PlatformContext";
import { usePlayerStore } from "@/stores/playerStore";

function AudioPlayerInner() {
	const platform = usePlatform();
	// Individual selectors to avoid re-rendering on unrelated state changes.
	// Only the specific fields used by this component trigger re-renders.
	const audioUrl = usePlayerStore((s) => s.audioUrl);
	const audioId = usePlayerStore((s) => s.audioId);
	const profileId = usePlayerStore((s) => s.profileId);
	const title = usePlayerStore((s) => s.title);
	const isPlaying = usePlayerStore((s) => s.isPlaying);
	const currentTime = usePlayerStore((s) => s.currentTime);
	const duration = usePlayerStore((s) => s.duration);
	const volume = usePlayerStore((s) => s.volume);
	const isMuted = usePlayerStore((s) => s.isMuted);
	const playbackRate = usePlayerStore((s) => s.playbackRate);
	const isLooping = usePlayerStore((s) => s.isLooping);
	const shouldRestart = usePlayerStore((s) => s.shouldRestart);
	const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
	const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
	const setDuration = usePlayerStore((s) => s.setDuration);
	const setVolume = usePlayerStore((s) => s.setVolume);
	const setIsMuted = usePlayerStore((s) => s.setIsMuted);
	const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
	const toggleLoop = usePlayerStore((s) => s.toggleLoop);
	const clearRestartFlag = usePlayerStore((s) => s.clearRestartFlag);
	const reset = usePlayerStore((s) => s.reset);

	// Throttle WaveSurfer timeupdate (fires ~60fps) into one store commit
	// per animation frame — cuts wasted re-renders of ~20 subscribed components.
	const throttledSetCurrentTime = useThrottledTimeUpdate(setCurrentTime);

	// Check if profile has assigned channels (for native audio routing)
	const { data: profileChannels } = useQuery({
		queryKey: ["profile-channels", profileId],
		queryFn: () => {
			if (!profileId) {
				return { channel_ids: [] };
			}
			return apiClient.getProfileChannels(profileId);
		},
		enabled: !!profileId && platform.metadata.isTauri,
	});

	const { data: channels } = useQuery({
		queryKey: ["channels"],
		queryFn: () => apiClient.listChannels(),
		enabled: !!profileChannels && profileChannels.channel_ids.length > 0,
	});

	// Determine if we should use native playback
	const useNativePlayback = useMemo(() => {
		if (!platform.metadata.isTauri || !profileChannels || !channels) {
			return false;
		}

		const assignedChannels = channels.filter((ch) =>
			profileChannels.channel_ids.includes(ch.id),
		);

		// Use native playback if any assigned channel has non-default devices
		const shouldUseNative = assignedChannels.some(
			(ch) => ch.device_ids.length > 0 && !ch.is_default,
		);

		return shouldUseNative;
	}, [profileChannels, channels, platform.metadata.isTauri]);

	const waveformRef = useRef<HTMLDivElement>(null);
	const wavesurferRef = useRef<WaveSurfer | null>(null);
	const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
	// Latest seek helper for the MediaSession effect (avoids stale closures).
	const seekBySecondsRef = useRef<((delta: number) => void) | null>(null);
	const loadingRef = useRef(false);
	const previousAudioIdRef = useRef<string | null>(null);
	const hasInitializedRef = useRef(false);
	const isUsingNativePlaybackRef = useRef(false);
	// Last URL the load effect ran for — resets fallback only on a real track change.
	const lastLoadedUrlRef = useRef<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [wsReady, setWsReady] = useState(false);
	const [useFallback, setUseFallback] = useState(false);

	// Create WaveSurfer once when the player becomes visible (audioUrl is set).
	// This instance is reused for all subsequent audio loads - never destroyed until unmount.
	useEffect(() => {
		if (!audioUrl) {
			return;
		}
		if (wavesurferRef.current) {
			return; // already created
		}

		let retryTimer: ReturnType<typeof setTimeout> | null = null;
		const initWaveSurfer = () => {
			const container = waveformRef.current;
			if (!container) {
				retryTimer = setTimeout(initWaveSurfer, 50);
				return;
			}

			const rect = container.getBoundingClientRect();
			const style = window.getComputedStyle(container);
			const isVisible =
				rect.width > 0 &&
				rect.height > 0 &&
				style.display !== "none" &&
				style.visibility !== "hidden";

			if (!isVisible) {
				retryTimer = setTimeout(initWaveSurfer, 50);
				return;
			}

			debug.log("Creating WaveSurfer instance", {
				width: rect.width,
				height: rect.height,
			});

			try {
				const root = document.documentElement;
				const getCSSVar = (varName: string) => {
					const value = getComputedStyle(root).getPropertyValue(varName).trim();
					return value ? `hsl(${value})` : "";
				};

				const wavesurfer = WaveSurfer.create({
					container,
					waveColor: getCSSVar("--muted"),
					progressColor: getCSSVar("--accent"),
					cursorColor: getCSSVar("--accent"),
					cursorWidth: 3,
					barWidth: 2,
					barRadius: 2,
					height: 40,
					normalize: true,
					interact: true,
					dragToSeek: { debounceTime: 0 },
					mediaControls: false,
					backend: "WebAudio",
				});

				// Wire up event handlers (these persist for the lifetime of the instance)
				wavesurfer.on("timeupdate", (time) => {
					const dur = usePlayerStore.getState().duration;
					if (dur > 0 && time >= dur) {
						setCurrentTime(dur);
						const loop = usePlayerStore.getState().isLooping;
						if (loop) {
							wavesurfer.seekTo(0);
							wavesurfer
								.play()
								.catch((err) => debug.error("Loop play failed:", err));
						} else {
							wavesurfer.pause();
							setIsPlaying(false);
						}
						return;
					}
					// Use throttled setter for time updates during playback.
					// Coalesces multiple timeupdate events per frame into one
					// store commit, reducing re-renders of ~20 subscribers.
					throttledSetCurrentTime(time);
				});

				wavesurfer.on("ready", () => {
					const dur = wavesurfer.getDuration();
					setDuration(dur);
					loadingRef.current = false;
					setIsLoading(false);
					setError(null);
					debug.log("Audio ready, duration:", dur);

					const st = usePlayerStore.getState();
					wavesurfer.setMuted(st.isMuted);
					wavesurfer.setVolume(st.isMuted ? 0 : st.volume);
					try {
						wavesurfer.setPlaybackRate(st.playbackRate);
					} catch (err) {
						debug.error("Failed to set playback rate:", err);
					}

					// Auto-play if the flag is set (story mode advance or explicit play).
					// Note: the flag is usually consumed async after fetch+decode,
					// so the click gesture is gone and the browser may refuse
					// with NotAllowedError. That's normal — stay silent and let
					// the user tap play (a real gesture).
					const shouldAutoPlayNow = usePlayerStore.getState().shouldAutoPlay;
					if (shouldAutoPlayNow) {
						usePlayerStore.getState().clearAutoPlayFlag();
						wavesurfer.play().catch((err) => {
							const name = err instanceof Error ? err.name : "";
							if (name === "NotAllowedError") {
								debug.log("Autoplay blocked — waiting for user gesture");
								return;
							}
							debug.error("Failed to autoplay:", err);
							setError(
								`Playback error: ${err instanceof Error ? err.message : String(err)}`,
							);
						});
					} else {
						debug.log("Skipping auto-play - shouldAutoPlay is false");
					}
				});

				wavesurfer.on("play", () => setIsPlaying(true));
				wavesurfer.on("pause", () => {
					setIsPlaying(false);
					setCurrentTime(wavesurfer.getCurrentTime());
				});

				wavesurfer.on("seeking", (time) => setCurrentTime(time));

				// Mute audio during drag-to-seek to prevent popping from the WebAudio
				// backend's hard stop/start cycle on each seek. Unmute with a short
				// fade-in when the drag ends.
				const seekMedia = wavesurfer.getMediaElement() as unknown as {
					getGainNode?: () => GainNode | null;
				};
				const seekGain: GainNode | null = seekMedia?.getGainNode?.() ?? null;
				if (seekGain) {
					const ctx = seekGain.context as AudioContext;
					wavesurfer.on("dragstart", () => {
						seekGain.gain.cancelScheduledValues(ctx.currentTime);
						seekGain.gain.setTargetAtTime(0, ctx.currentTime, 0.002);
					});
					wavesurfer.on("dragend", () => {
						seekGain.gain.cancelScheduledValues(ctx.currentTime);
						seekGain.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
					});
				}
				wavesurfer.on("finish", () => {
					const loop = usePlayerStore.getState().isLooping;
					if (loop) {
						wavesurfer.seekTo(0);
						wavesurfer
							.play()
							.catch((err) => debug.error("Loop play failed:", err));
					} else {
						setIsPlaying(false);
						const onFinish = usePlayerStore.getState().onFinish;
						if (onFinish) {
							onFinish();
						}
					}
				});

				wavesurfer.on("error", (err) => {
					debug.error("WaveSurfer error:", err);
					setIsLoading(false);
					setError(
						`Audio error: ${err instanceof Error ? err.message : String(err)}`,
					);
				});

				wavesurfer.on("loading", (percent) => {
					setIsLoading(true);
					if (percent === 100) {
						setIsLoading(false);
					}
				});

				wavesurferRef.current = wavesurfer;
				setWsReady(true);
				debug.log("WaveSurfer created successfully");
			} catch (err) {
				debug.error("Failed to create WaveSurfer:", err);
				setError(
					`Failed to initialize waveform: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		};

		let rafId: number;
		rafId = requestAnimationFrame(() => {
			initWaveSurfer();
		});

		return () => {
			cancelAnimationFrame(rafId);
			// Also cancel the init-retry timer — otherwise the 50 ms retry
			// loop survives unmount (the container ref is permanently null)
			// and leaks a timer per mount for the session's lifetime.
			if (retryTimer !== null) {
				clearTimeout(retryTimer);
			}
		};
		// Only run on mount-like conditions. audioUrl is here so we create the instance
		// when the player first appears, but we guard against re-creation above.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		audioUrl,
		setIsPlaying,
		setDuration,
		setCurrentTime, // Use throttled setter for time updates during playback.
		// Coalesces multiple timeupdate events per frame into one
		// store commit, reducing re-renders of ~20 subscribers.
		throttledSetCurrentTime,
	]);

	// Destroy WaveSurfer only on unmount
	useEffect(() => {
		return () => {
			if (wavesurferRef.current) {
				debug.log("Destroying WaveSurfer instance (unmount)");
				try {
					wavesurferRef.current.destroy();
				} catch (err) {
					debug.error("Error destroying WaveSurfer:", err);
				}
				wavesurferRef.current = null;
				setWsReady(false);
			}
		};
	}, []);

	// Load audio when URL changes (reuses the existing WaveSurfer instance).
	// useFallback is intentionally NOT a dependency: a load failure flips it
	// true, and depending on it here re-ran the effect, cleared the flag, and
	// re-fetched forever (thousands of 404s against /audio/{id}). The URL ref
	// resets fallback only when a new track is selected.
	useEffect(() => {
		const wavesurfer = wavesurferRef.current;
		if (!wavesurfer || !wsReady) {
			return;
		}

		if (!audioUrl) {
			// No audio - pause and reset
			wavesurfer.pause();
			wavesurfer.seekTo(0);
			loadingRef.current = false;
			setIsLoading(false);
			setDuration(0);
			setCurrentTime(0);
			setError(null);
			isUsingNativePlaybackRef.current = false;
			lastLoadedUrlRef.current = null;
			return;
		}

		// Reset native playback state
		isUsingNativePlaybackRef.current = false;
		const st = usePlayerStore.getState();
		wavesurfer.setMuted(st.isMuted);
		wavesurfer.setVolume(st.isMuted ? 0 : st.volume);

		// Stop current playback and reset position before loading new audio.
		// With the WebAudio backend, pause() accumulates playedDuration internally.
		// seekTo(0) resets it so the new track starts from the beginning.
		debug.log("Loading new audio URL:", audioUrl);
		try {
			if (wavesurfer.isPlaying()) {
				wavesurfer.pause();
			}
			wavesurfer.seekTo(0);
		} catch (err) {
			debug.error("Error resetting before load:", err);
		}

		loadingRef.current = true;
		setIsLoading(true);
		setError(null);
		setCurrentTime(0);
		setDuration(0);
		// Retry WaveSurfer first on every new URL — a prior decode failure
		// must not pin all later tracks to the fallback. Bail-out setState
		// when already false means this is free on the happy path.
		if (lastLoadedUrlRef.current !== audioUrl) {
			lastLoadedUrlRef.current = audioUrl;
			setUseFallback(false);
		}

		wavesurfer
			.load(audioUrl)
			.then(() => {
				debug.log("Audio loaded into WaveSurfer");
				loadingRef.current = false;
			})
			.catch((err) => {
				debug.error("Failed to load audio:", err);
				loadingRef.current = false;
				setIsLoading(false);
				// WaveSurfer WebAudio decode failed (common on Tauri webviews
				// and for MP3/WebM without codecs) — fall back to a plain
				// <audio> element so playback still works instead of showing
				// a dead player.
				setUseFallback(true);
				setError(null);
			});
	}, [audioUrl, wsReady, setCurrentTime, setDuration]);

	// Sync play/pause state (only when user clicks play/pause button, not auto-sync)
	// This effect is kept for external state changes but should be minimal
	useEffect(() => {
		if (!wavesurferRef.current || duration === 0) {
			return;
		}

		if (isPlaying && wavesurferRef.current.isPlaying() === false) {
			wavesurferRef.current.play().catch((error) => {
				debug.error("Failed to play:", error);
				setIsPlaying(false);
				setError(
					`Playback error: ${error instanceof Error ? error.message : String(error)}`,
				);
			});
		} else if (!isPlaying && wavesurferRef.current.isPlaying()) {
			wavesurferRef.current.pause();
		}
	}, [isPlaying, setIsPlaying, duration]);

	// Sync volume + listening speed (both engines)
	useEffect(() => {
		const fallback = fallbackAudioRef.current;
		if (fallback) {
			fallback.volume = volume;
			fallback.muted = isMuted;
			fallback.playbackRate = playbackRate;
		}
		const ws = wavesurferRef.current;
		if (!ws) {
			return;
		}
		ws.setMuted(isMuted);
		ws.setVolume(isMuted ? 0 : volume);
		try {
			ws.setPlaybackRate(playbackRate);
		} catch (err) {
			debug.error("Failed to set playback rate:", err);
		}
	}, [volume, isMuted, playbackRate]);

	// Mark as initialized when audio is ready, reset when audioId changes
	useEffect(() => {
		if (duration > 0 && audioId) {
			hasInitializedRef.current = true;
		}
		// Reset initialization flag when audioId changes to a new audio
		if (
			audioId !== previousAudioIdRef.current &&
			previousAudioIdRef.current !== null
		) {
			hasInitializedRef.current = false;
		}
		if (audioId !== null) {
			previousAudioIdRef.current = audioId;
		}
	}, [duration, audioId]);

	// Handle restart flag - when history item is clicked again, restart from beginning
	useEffect(() => {
		if (!shouldRestart || duration === 0) {
			return;
		}

		debug.log("Restarting current audio from beginning");
		const fallback = useFallback ? fallbackAudioRef.current : null;
		if (fallback) {
			fallback.currentTime = 0;
			fallback.play().catch((error) => {
				debug.error("Failed to play after restart:", error);
				setIsPlaying(false);
			});
			clearRestartFlag();
			return;
		}
		const wavesurfer = wavesurferRef.current;
		if (!wavesurfer) {
			return;
		}
		wavesurfer.seekTo(0);
		wavesurfer.play().catch((error) => {
			debug.error("Failed to play after restart:", error);
			setIsPlaying(false);
			setError(
				`Playback error: ${error instanceof Error ? error.message : String(error)}`,
			);
		});

		clearRestartFlag();
	}, [shouldRestart, duration, setIsPlaying, clearRestartFlag, useFallback]);

	// Auto-play is handled exclusively in the WaveSurfer 'ready' event handler.
	// A separate effect here would race with the ready event since the WebAudio
	// backend needs to fully decode the audio before play() works correctly.

	// Spacebar to play/pause (capture phase so it fires before focused elements)
	useEffect(() => {
		const isTypingTarget = (t: EventTarget | null) => {
			const el = t as HTMLElement | null;
			if (!el || typeof el !== "object") {
				return false;
			}
			const tag = (el as HTMLElement)?.tagName;
			return (
				tag === "INPUT" ||
				tag === "TEXTAREA" ||
				tag === "SELECT" ||
				(el as HTMLElement)?.isContentEditable
			);
		};
		const togglePlayback = () => {
			if (useFallback && fallbackAudioRef.current) {
				const el = fallbackAudioRef.current;
				if (el.paused) {
					el.play().catch((err) => debug.error("Spacebar play failed:", err));
				} else {
					el.pause();
				}
			} else if (wavesurferRef.current) {
				if (wavesurferRef.current.isPlaying()) {
					wavesurferRef.current.pause();
				} else {
					wavesurferRef.current
						.play()
						.catch((err) => debug.error("Spacebar play failed:", err));
				}
			}
		};
		// Shared seek helper for keyboard + OS media keys (seconds, clamped).
		const seekBySeconds = (delta: number) => {
			const dur = usePlayerStore.getState().duration;
			if (dur <= 0) {
				return;
			}
			const cur = useFallback
				? (fallbackAudioRef.current?.currentTime ?? 0)
				: (wavesurferRef.current?.getCurrentTime() ?? 0);
			const next = Math.min(dur, Math.max(0, cur + delta));
			if (useFallback && fallbackAudioRef.current) {
				fallbackAudioRef.current.currentTime = next;
				return;
			}
			wavesurferRef.current?.seekTo(next / dur);
		};
		seekBySecondsRef.current = seekBySeconds;
		const onKeyDown = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) {
				return;
			}
			if (e.code === "Space") {
				// Inside AudioStudio the studio's own transport owns Space —
				// this capture-phase handler must not steal it (it would
				// stopPropagation before the element-level handler sees it).
				const target = e.target as HTMLElement | null;
				if (target?.closest?.("[data-audio-studio]")) {
					return;
				}
				if (audioUrl && duration > 0) {
					e.preventDefault();
					e.stopPropagation();
					togglePlayback();
				}
				return;
			}
			// Arrow seek: ±10s (Shift: ±30s). Pill has no room for skip
			// buttons, so the keyboard carries this.
			if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
				if (!audioUrl || duration <= 0) {
					return;
				}
				e.preventDefault();
				const step =
					(e.shiftKey ? 30 : 10) * (e.code === "ArrowRight" ? 1 : -1);
				seekBySeconds(step);
			}
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [audioUrl, duration, useFallback]);

	// OS-level media keys + lock-screen metadata (no-op where unsupported).
	useEffect(() => {
		if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
			return;
		}
		try {
			navigator.mediaSession.metadata = audioUrl
				? new MediaMetadata({ title: title ?? "otoyin playback" })
				: null;
			navigator.mediaSession.setActionHandler("play", () => {
				if (useFallback && fallbackAudioRef.current) {
					fallbackAudioRef.current.play().catch(() => {});
				} else {
					wavesurferRef.current?.play().catch(() => {});
				}
			});
			navigator.mediaSession.setActionHandler("pause", () => {
				if (useFallback && fallbackAudioRef.current) {
					fallbackAudioRef.current.pause();
				} else {
					wavesurferRef.current?.pause();
				}
			});
			navigator.mediaSession.setActionHandler("seekbackward", (d) => {
				seekBySecondsRef.current?.(-(d.seekOffset ?? 10));
			});
			navigator.mediaSession.setActionHandler("seekforward", (d) => {
				seekBySecondsRef.current?.(d.seekOffset ?? 10);
			});
		} catch (err) {
			debug.log("MediaSession unavailable:", err);
		}
		return () => {
			try {
				navigator.mediaSession.metadata = null;
				for (const a of [
					"play",
					"pause",
					"seekbackward",
					"seekforward",
				] as const) {
					navigator.mediaSession.setActionHandler(a, null);
				}
			} catch {
				// Teardown best-effort.
			}
		};
	}, [audioUrl, title, useFallback]);

	const handlePlayPause = useCallback(async () => {
		// Fallback <audio> path (WaveSurfer decode unsupported) — plain
		// HTMLAudio always works in the webview, including autoplay-policy
		// edge cases, because this handler IS a user gesture.
		if (useFallback) {
			const el = fallbackAudioRef.current;
			if (!el) {
				return;
			}
			try {
				if (el.paused) {
					await el.play();
					setIsPlaying(true);
				} else {
					el.pause();
					setIsPlaying(false);
				}
			} catch (error) {
				debug.error("Fallback playback failed:", error);
				setError(
					`Playback error: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			return;
		}
		// Standard WaveSurfer playback (works for both normal and native playback modes)
		// When using native playback, WaveSurfer is muted but still controls visualization
		if (!wavesurferRef.current) {
			debug.error("WaveSurfer not initialized");
			return;
		}

		// Check if audio is loaded
		if (duration === 0 && !isLoading) {
			debug.error("Audio not loaded yet");
			setError("Audio not loaded. Please wait...");
			return;
		}

		// If using native playback
		if (useNativePlayback && audioUrl && profileChannels && channels) {
			if (isPlaying) {
				// Pause: stop native playback and pause WaveSurfer visualization
				try {
					platform.audio.stopPlayback();
					debug.log("Stopped native audio playback");
				} catch (error) {
					debug.error("Failed to stop native playback:", error);
				}
				wavesurferRef.current.pause();
				return;
			}

			// Play: trigger native playback
			try {
				// Stop any existing native playback first
				try {
					platform.audio.stopPlayback();
				} catch (_error) {
					// Ignore errors when stopping (might not be playing)
					debug.log("No existing playback to stop");
				}

				// Collect all device IDs from assigned channels
				const assignedChannels = channels.filter((ch) =>
					profileChannels.channel_ids.includes(ch.id),
				);
				const deviceIds = assignedChannels.flatMap((ch) => ch.device_ids);

				if (deviceIds.length > 0) {
					// Fetch audio data
					const response = await fetch(audioUrl);
					const audioData = new Uint8Array(await response.arrayBuffer());

					// Play via native audio
					await platform.audio.playToDevices(audioData, deviceIds);

					// Mark that we're using native playback
					isUsingNativePlaybackRef.current = true;

					// Mute WaveSurfer and start it for visualization
					wavesurferRef.current.setVolume(0);
					wavesurferRef.current.setMuted(true);

					// Start WaveSurfer for visualization (muted)
					wavesurferRef.current.play().catch((error) => {
						debug.error("Failed to start WaveSurfer visualization:", error);
						setIsPlaying(false);
						setError(
							`Playback error: ${error instanceof Error ? error.message : String(error)}`,
						);
					});

					return;
				}
			} catch (error) {
				debug.error(
					"Native playback failed, falling back to WaveSurfer:",
					error,
				);
				// Fall through to WaveSurfer playback
				isUsingNativePlaybackRef.current = false;
			}
		}

		// Standard WaveSurfer playback (or fallback from native playback failure)
		if (wavesurferRef.current.isPlaying()) {
			wavesurferRef.current.pause();
		} else {
			// Ensure WaveSurfer is not muted if not using native playback
			if (!isUsingNativePlaybackRef.current) {
				wavesurferRef.current.setMuted(false);
				wavesurferRef.current.setVolume(volume);
			}

			wavesurferRef.current.play().catch((error) => {
				debug.error("Failed to play:", error);
				setIsPlaying(false);
				setError(
					`Playback error: ${error instanceof Error ? error.message : String(error)}`,
				);
			});
		}
	}, [
		volume,
		isPlaying,
		setIsPlaying,
		useNativePlayback,
		profileChannels,
		channels,
		platform,
		audioUrl,
		duration,
		isLoading,
		useFallback,
	]);

	const handleSeek = useCallback(
		(value: number[]) => {
			if (duration === 0) {
				return;
			}
			const progress = (value[0] ?? 0) / 100;
			if (useFallback && fallbackAudioRef.current) {
				fallbackAudioRef.current.currentTime = progress * duration;
				return;
			}
			if (!wavesurferRef.current) {
				return;
			}
			wavesurferRef.current.seekTo(progress);
		},
		[duration, useFallback],
	);

	const handleVolumeChange = useCallback(
		(value: number[]) => {
			setVolume((value[0] ?? 100) / 100);
		},
		[setVolume],
	);

	const retryLoad = useCallback(() => {
		if (!audioUrl) {
			return;
		}
		setError(null);
		setIsLoading(true);
		if (useFallback) {
			fallbackAudioRef.current?.load();
			return;
		}
		if (!wavesurferRef.current) {
			setIsLoading(false);
			setError("Player not ready — close and play again.");
			return;
		}
		wavesurferRef.current
			.load(audioUrl)
			.then(() => {
				loadingRef.current = false;
			})
			.catch((err) => {
				debug.error("Retry load failed:", err);
				loadingRef.current = false;
				setIsLoading(false);
				setUseFallback(true);
				setError(null);
			});
	}, [audioUrl, useFallback]);

	const handleClose = useCallback(() => {
		// Stop any native playback
		if (isUsingNativePlaybackRef.current && platform.metadata.isTauri) {
			try {
				platform.audio.stopPlayback();
			} catch (error) {
				debug.error("Failed to stop native playback:", error);
			}
		}
		// Stop fallback audio
		if (fallbackAudioRef.current) {
			fallbackAudioRef.current.pause();
			fallbackAudioRef.current.removeAttribute("src");
		}
		setUseFallback(false);
		// Stop WaveSurfer
		if (wavesurferRef.current) {
			wavesurferRef.current.pause();
			wavesurferRef.current.seekTo(0);
		}
		// Reset player state
		reset();
	}, [platform, reset]);

	// Don't render if no audio
	if (!audioUrl) {
		return null;
	}

	const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
	const timeLabel = `${formatAudioDuration(currentTime)} / ${formatAudioDuration(duration)}`;

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
			<div className="pointer-events-auto flex h-14 w-full max-w-3xl items-center gap-2.5 rounded-2xl border border-border bg-card/95 px-2.5 py-2 shadow-xl backdrop-blur">
				{/* Play/Pause Button */}
				<button
					type="button"
					onClick={handlePlayPause}
					disabled={isLoading || (duration === 0 && !useFallback)}
					className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition hover:brightness-110 disabled:opacity-40"
					title={
						isLoading
							? "Loading…"
							: duration === 0 && !useFallback
								? "Audio not loaded"
								: isPlaying
									? "Pause (Space)"
									: "Play (Space)"
					}
					aria-label={
						duration === 0 && !isLoading && !useFallback
							? "Audio not loaded"
							: isPlaying
								? "Pause"
								: "Play"
					}
				>
					{isLoading ? (
						<span
							className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
							aria-hidden="true"
						/>
					) : isPlaying ? (
						<Pause className="size-5 fill-current" aria-hidden="true" />
					) : (
						<Play className="size-5 fill-current" aria-hidden="true" />
					)}
				</button>

				{/* Title */}
				{title ? (
					<p className="hidden max-w-[140px] shrink-0 truncate text-xs font-medium text-foreground sm:block">
						{title}
					</p>
				) : null}

				{/* Waveform / seek / error */}
				<div className="flex min-w-0 flex-1 items-center">
					{error ? (
						<div className="flex min-w-0 flex-1 items-center gap-2 px-1">
							<p className="min-w-0 flex-1 truncate text-xs text-destructive">
								{error}
							</p>
							<button
								type="button"
								onClick={retryLoad}
								title="Retry loading audio"
								aria-label="Retry loading audio"
								className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-secondary"
							>
								Retry
							</button>
						</div>
					) : useFallback ? (
						<Slider
							value={[progress]}
							onValueChange={handleSeek}
							max={100}
							step={0.1}
							className="w-full"
							aria-label="Seek"
							aria-valuetext={timeLabel}
						/>
					) : (
						<div
							ref={waveformRef}
							className="h-10 w-full select-none"
							title="Click or drag to seek"
						/>
					)}
				</div>

				{/* Time Display */}
				<span
					className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline"
					title="Elapsed / total"
				>
					{timeLabel}
				</span>

				{/* Listening speed */}
				<button
					type="button"
					onClick={() => {
						const steps = [1, 1.25, 1.5, 2, 0.75];
						const idx = steps.indexOf(playbackRate);
						setPlaybackRate(steps[(idx + 1) % steps.length] ?? 1);
					}}
					className="grid h-8 min-w-10 shrink-0 place-items-center rounded-full px-2 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					title={`Playback speed ${playbackRate}× — click to change`}
					aria-label={`Playback speed ${playbackRate} times. Activate to change speed.`}
				>
					{playbackRate}×
				</button>

				{/* Loop Button */}
				<button
					type="button"
					onClick={toggleLoop}
					className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors ${
						isLooping
							? "bg-accent text-accent-foreground"
							: "text-muted-foreground hover:bg-secondary hover:text-foreground"
					}`}
					title={isLooping ? "Stop looping" : "Loop track"}
					aria-label={isLooping ? "Stop looping" : "Loop"}
					aria-pressed={isLooping}
				>
					<Repeat className="size-4" aria-hidden="true" />
				</button>

				{/* Volume Control */}
				<button
					type="button"
					onClick={() => setIsMuted(!isMuted)}
					className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					title={isMuted || volume === 0 ? "Unmute" : "Mute"}
					aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
					aria-pressed={isMuted}
				>
					{isMuted || volume === 0 ? (
						<VolumeX className="size-4" aria-hidden="true" />
					) : (
						<Volume2 className="size-4" aria-hidden="true" />
					)}
				</button>
				<div className="hidden w-20 shrink-0 md:block">
					<Slider
						value={[isMuted ? 0 : volume * 100]}
						onValueChange={handleVolumeChange}
						max={100}
						step={1}
						className="w-full"
						aria-label="Volume"
						title={`${Math.round((isMuted ? 0 : volume) * 100)}% volume`}
						aria-valuetext={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
					/>
				</div>

				{/* Close Button */}
				<button
					type="button"
					onClick={handleClose}
					className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					title="Close player"
					aria-label="Close player"
				>
					<X className="size-4" aria-hidden="true" />
				</button>
			</div>
			{/* Hidden fallback engine (WaveSurfer decode unsupported) */}
			{useFallback ? (
				// biome-ignore lint/a11y/useMediaCaption: hidden playback engine, not user-facing media — captions don't apply
				<audio
					ref={fallbackAudioRef}
					src={audioUrl}
					preload="auto"
					className="hidden"
					onLoadedMetadata={(e) => {
						const el = e.currentTarget;
						const st = usePlayerStore.getState();
						el.volume = st.volume;
						el.muted = st.isMuted;
						el.playbackRate = st.playbackRate;
						setDuration(el.duration || 0);
						setIsLoading(false);
					}}
					onTimeUpdate={(e) =>
						throttledSetCurrentTime(e.currentTarget.currentTime)
					}
					onPlay={() => setIsPlaying(true)}
					onPause={() => setIsPlaying(false)}
					onEnded={() => {
						setIsPlaying(false);
						// Mirror the WaveSurfer "finish" path: streaming chunk
						// chaining depends on this global slot firing.
						const onFinish = usePlayerStore.getState().onFinish;
						if (onFinish) {
							onFinish();
						}
					}}
					onError={() =>
						setError(
							"Audio file could not be played — re-generate or check the backend.",
						)
					}
				/>
			) : null}
		</div>
	);
}

// Memoize: AudioPlayer is expensive (WaveSurfer init, many effects).
// Prevents re-render when parent re-renders but playerStore state unchanged.
export const AudioPlayer = memo(AudioPlayerInner);
