import { useCallback, useEffect, useRef, useState } from "react";
import {
	RECORDING_MIME_TYPE,
	RECORDING_MIME_TYPE_FALLBACK,
	RECORDING_MIME_TYPE_MP4,
	RECORDING_MIME_TYPE_MP4_PLAIN,
	RECORDING_MIME_TYPE_WAV,
	RECORDING_TIMESLICE_MS,
} from "@/lib/constants/audio";
import {
	isNativeMicAvailable,
	startNativeMicCapture,
	stopNativeMicCapture,
} from "@/lib/audio/nativeMic";
import { usePlatform } from "@/platform/PlatformContext";

interface UseAudioRecordingOptions {
	maxDurationSeconds?: number;
	onRecordingComplete?: (blob: Blob, duration?: number) => void;
	onRecordingError?: () => void;
	preferWav?: boolean;
}

export function useAudioRecording({
	maxDurationSeconds,
	onRecordingComplete,
	onRecordingError,
	preferWav = false,
}: UseAudioRecordingOptions = {}) {
	const platform = usePlatform();
	const [isRecording, setIsRecording] = useState(false);
	const [duration, setDuration] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const streamRef = useRef<MediaStream | null>(null);
	const timerRef = useRef<number | null>(null);
	const startTimeRef = useRef<number | null>(null);
	const cancelledRef = useRef<boolean>(false);
	// True while a NATIVE (Rust sidecar) capture owns the session instead
	// of MediaRecorder. stop/cancel must route to the matching backend.
	const nativeRef = useRef<boolean>(false);

	// Shared recording clock for both capture paths. onLimit fires once
	// when the caller opted into a max duration (voice-clone samplers pass
	// 29s; dictation passes none and runs until stopped).
	const startClock = useCallback(
		(onLimit: () => void) => {
			startTimeRef.current = Date.now();
			timerRef.current = window.setInterval(() => {
				if (!startTimeRef.current) {
					return;
				}
				const elapsed = (Date.now() - startTimeRef.current) / 1000;
				setDuration(elapsed);
				if (
					maxDurationSeconds !== undefined &&
					elapsed >= maxDurationSeconds
				) {
					onLimit();
				}
			}, 100);
		},
		[maxDurationSeconds],
	);

	const stopRecording = useCallback(() => {
		if (nativeRef.current) {
			// Native path: stop the sidecar capture, deliver 16 kHz mono WAV.
			nativeRef.current = false;
			setIsRecording(false);
			if (timerRef.current !== null) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
			const durationSecs = startTimeRef.current
				? (Date.now() - startTimeRef.current) / 1000
				: undefined;
			void stopNativeMicCapture().then(
				(blob) => {
					if (!cancelledRef.current) {
						onRecordingComplete?.(blob, durationSecs);
					}
				},
				(err: unknown) => {
					setError(
						err instanceof Error ? err.message : "Microphone capture failed",
					);
					onRecordingError?.();
				},
			);
			return;
		}
		if (mediaRecorderRef.current && isRecording) {
			mediaRecorderRef.current.stop();
			setIsRecording(false);

			if (timerRef.current !== null) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		}
	}, [isRecording, onRecordingComplete, onRecordingError]);

	const startRecording = useCallback(async () => {
		try {
			setError(null);
			chunksRef.current = [];
			cancelledRef.current = false;
			nativeRef.current = false;
			setDuration(0);

			// Native sidecar first (Tauri only): cpal mic capture works on
			// all three OSs where webview getUserMedia is fragile or broken.
			// Any failure falls through to the webview path below.
			if (platform.metadata.isTauri) {
				try {
					if (await isNativeMicAvailable()) {
						await startNativeMicCapture(null);
						nativeRef.current = true;
						setIsRecording(true);
						startClock(() => {
							void stopRecording();
						});
						return;
					}
				} catch (nativeError) {
					nativeRef.current = false;
					console.warn(
						"[recording] native mic unavailable, trying webview:",
						nativeError,
					);
				}
			}

			// Check if getUserMedia is available
			// In Tauri, navigator.mediaDevices might not be available immediately
			if (typeof navigator === "undefined") {
				const errorMsg =
					"Navigator API is not available. This might be a Tauri configuration issue.";
				setError(errorMsg);
				throw new Error(errorMsg);
			}

			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				// In Tauri webview, mediaDevices may take a moment to initialize.
				// Poll with backoff instead of arbitrary sleep.
				for (let attempt = 0; attempt < 5; attempt++) {
					await new Promise((resolve) =>
						setTimeout(resolve, 50 * 2 ** attempt),
					);
					if (navigator.mediaDevices) {
						break;
					}
				}

				if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
					console.error("MediaDevices check:", {
						hasNavigator: typeof navigator !== "undefined",
						hasMediaDevices: !!navigator?.mediaDevices,
						hasGetUserMedia: !!navigator?.mediaDevices?.getUserMedia,
						isTauri: platform.metadata.isTauri,
					});

					const errorMsg = platform.metadata.isTauri
						? "Microphone access is not available. Please ensure:\n1. The app has microphone permissions in System Settings (macOS: System Settings > Privacy & Security > Microphone)\n2. You restart the app after granting permissions\n3. You are using Tauri v2 with a webview that supports getUserMedia"
						: "Microphone access is not available. Please ensure you are using a secure context (HTTPS or localhost) and that your browser has microphone permissions enabled.";
					setError(errorMsg);
					throw new Error(errorMsg);
				}
			}

			// Request microphone access
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});

			streamRef.current = stream;

			// Build MIME type preference chain: WAV first if requested, then WebM/Opus,
			// then WebKit MP4/AAC, then plain fallbacks. Never assume opus exists.
			const mimeTypeChain = preferWav
				? [
						RECORDING_MIME_TYPE_WAV,
						RECORDING_MIME_TYPE,
						RECORDING_MIME_TYPE_FALLBACK,
						RECORDING_MIME_TYPE_MP4,
						RECORDING_MIME_TYPE_MP4_PLAIN,
					]
				: [
						RECORDING_MIME_TYPE,
						RECORDING_MIME_TYPE_FALLBACK,
						RECORDING_MIME_TYPE_MP4,
						RECORDING_MIME_TYPE_MP4_PLAIN,
					];

			let options: MediaRecorderOptions = { mimeType: mimeTypeChain[0] };

			// Find first supported MIME type
			for (const mimeType of mimeTypeChain) {
				if (MediaRecorder.isTypeSupported(mimeType)) {
					options = { mimeType };
					break;
				}
			}

			// If none supported, let browser choose default
			if (!mimeTypeChain.some((mt) => MediaRecorder.isTypeSupported(mt))) {
				options = {};
			}

			const mediaRecorder = new MediaRecorder(stream, options);
			mediaRecorderRef.current = mediaRecorder;

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};

			mediaRecorder.onstop = async () => {
				// Snapshot the cancellation flag and recorded duration immediately —
				// cancelRecording() clears chunks and sets cancelledRef synchronously
				// before this async handler runs, so we must check it first.
				const wasCancelled = cancelledRef.current;
				const recordedDuration = startTimeRef.current
					? (Date.now() - startTimeRef.current) / 1000
					: undefined;

				// Tag the blob with what the recorder ACTUALLY produced
				// (recorder.mimeType), not what we requested — on WebKit the
				// browser may normalize to MP4 even when our chain matched.
				const recordedBlob = new Blob(chunksRef.current, {
					type:
						mediaRecorder.mimeType || options.mimeType || "audio/webm",
				});

				// Stop all tracks now that we have the data
				streamRef.current?.getTracks().forEach((track) => {
					track.stop();
				});
				streamRef.current = null;

				// Don't fire completion callback if the recording was cancelled
				if (wasCancelled) {
					return;
				}

				// Send original format (WebM/Opus or WAV) directly — backend has ffmpeg for conversion
				onRecordingComplete?.(recordedBlob, recordedDuration);
			};

			mediaRecorder.onerror = (event) => {
				// A recorder error leaves the capture in a dead state — tear down
				// everything so the UI doesn't stay stuck "recording" forever.
				cancelledRef.current = true;
				setIsRecording(false);
				setDuration(0);
				if (timerRef.current !== null) {
					clearInterval(timerRef.current);
					timerRef.current = null;
				}
				streamRef.current?.getTracks().forEach((track) => {
					track.stop();
				});
				streamRef.current = null;
				const detail = event instanceof ErrorEvent ? event.message : undefined;
				setError(detail || "Recording error occurred");
				console.error("MediaRecorder error:", event);
				onRecordingError?.();
			};

			// WebKit's MediaRecorder drops the WebM EBML header from chunks when
			// started with a timeslice, so concatenated blobs fail to parse in
			// both AudioContext and ffmpeg. Starting with no timeslice produces
			// exactly one dataavailable on stop() with a valid container.
			mediaRecorder.start(RECORDING_TIMESLICE_MS);
			setIsRecording(true);
			startClock(() => {
				if (
					mediaRecorderRef.current &&
					mediaRecorderRef.current.state !== "inactive"
				) {
					mediaRecorderRef.current.stop();
					setIsRecording(false);
					if (timerRef.current !== null) {
						clearInterval(timerRef.current);
						timerRef.current = null;
					}
				}
			});
		} catch (err) {
			const errorMessage =
				err instanceof Error
					? err.message
					: "Failed to access microphone. Please check permissions.";
			setError(errorMessage);
			setIsRecording(false);
		}
	}, [
		onRecordingComplete,
		onRecordingError,
		preferWav,
		platform.metadata.isTauri,
		startClock,
		stopRecording,
	]);

	const cancelRecording = useCallback(() => {
		cancelledRef.current = true;
		if (nativeRef.current) {
			// Discard the sidecar capture; ignore the resulting blob.
			nativeRef.current = false;
			setIsRecording(false);
			setDuration(0);
			void stopNativeMicCapture().catch(() => {});
		} else if (mediaRecorderRef.current) {
			chunksRef.current = [];
			mediaRecorderRef.current.stop();
			setIsRecording(false);
			setDuration(0);
		}

		// Stop all tracks
		streamRef.current?.getTracks().forEach((track) => {
			track.stop();
		});
		streamRef.current = null;

		if (timerRef.current !== null) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current !== null) {
				clearInterval(timerRef.current);
			}
			streamRef.current?.getTracks().forEach((track) => {
				track.stop();
			});
			if (nativeRef.current) {
				// Don't strand a sidecar capture; discard without callback.
				nativeRef.current = false;
				void stopNativeMicCapture().catch(() => {});
			}
		};
	}, []);

	return {
		isRecording,
		duration,
		error,
		startRecording,
		stopRecording,
		cancelRecording,
	};
}
