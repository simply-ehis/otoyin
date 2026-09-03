import { useEffect, useRef, useState } from "react";
import { useAudioBus } from "@/lib/audio/audioBus";

/**
 * Hook that taps the monitored source's GainNode into a MediaStreamDestination
 * so audio can be captured/recorded while still playing through the speaker.
 *
 * The monitor source's gainNode is connected to both ctx.destination (speaker)
 * and a MediaStreamDestination (for recording) — no double-play, just one tap.
 */
export function useMonitorStream() {
	const [stream, setStream] = useState<MediaStream | null>(null);
	const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
	const ctxRef = useRef<AudioContext | null>(null);
	const sourceIdRef = useRef<string | null>(null);

	useEffect(() => {
		const unsub = useAudioBus.subscribe((state, prev) => {
			const newId = state.monitor.sourceId;
			const oldId = prev.monitor.sourceId;
			if (newId === oldId) {
				return;
			}

			// Clean up previous destination
			if (destRef.current) {
				try {
					destRef.current.disconnect();
				} catch {
					/* already disconnected */
				}
				destRef.current = null;
			}
			setStream(null);
			sourceIdRef.current = null;

			if (!newId) {
				return;
			}

			const source = state.sources[newId];
			if (!source) {
				return;
			}

			const ctx = source.gainNode.context as AudioContext;
			const dest = ctx.createMediaStreamDestination();
			try {
				source.gainNode.connect(dest);
			} catch {
				// Already connected or node detached
				return;
			}
			destRef.current = dest;
			ctxRef.current = ctx;
			sourceIdRef.current = newId;
			setStream(dest.stream);
		});

		return () => {
			unsub();
			if (destRef.current) {
				try {
					destRef.current.disconnect();
				} catch {
					/* already disconnected */
				}
				destRef.current = null;
			}
			setStream(null);
		};
	}, []);

	return stream;
}
