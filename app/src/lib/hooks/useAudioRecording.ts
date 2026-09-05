import { useCallback, useEffect, useRef, useState } from "react";
import {
	RECORDING_MIME_TYPE,
	RECORDING_MIME_TYPE_FALLBACK,
	RECORDING_MIME_TYPE_MP4,
	RECORDING_MIME_TYPE_MP4_PLAIN,
	RECORDING_MIME_TYPE_WAV,
	RECORDING_TIMESLICE_MS,
} from "@/lib/constants/audio";
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

	const startRecording = useCallback(async () => {
		try {
			setError(null);
			chunksRef.current = [];
			cancelledRef.current = false;
			setDuration(0);

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
			startTimeRef.current = Date.now();

			// Start timer
			timerRef.current = window.setInterval(() => {
				if (startTimeRef.current) {
					const elapsed = (Date.now() - startTimeRef.current) / 1000;
					setDuration(elapsed);

					// Auto-stop at max duration when the caller opts in — dictation
					// sessions pass undefined and run until the user releases the
					// chord or hits stop; voice-clone sample recorders pass 29s to
					// keep reference clips short.
					if (
						maxDurationSeconds !== undefined &&
						elapsed >= maxDurationSeconds
					) {
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
					}
				}
			}, 100);
		} catch (err) {
			const errorMessage =
				err instanceof Error
					? err.message
					: "Failed to access microphone. Please check permissions.";
			setError(errorMessage);
			setIsRecording(false);
		}
	}, [
		maxDurationSeconds,
		onRecordingComplete,
		onRecordingError,
		preferWav,
		platform.metadata.isTauri,
	]);

	const stopRecording = useCallback(() => {
		if (mediaRecorderRef.current && isRecording) {
			mediaRecorderRef.current.stop();
			setIsRecording(false);

			if (timerRef.current !== null) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		}
	}, [isRecording]);

	const cancelRecording = useCallback(() => {
		if (mediaRecorderRef.current) {
			cancelledRef.current = true; // Must be set before stop() triggers onstop
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
