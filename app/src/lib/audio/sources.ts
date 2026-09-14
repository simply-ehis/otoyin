import {
	type AudioSource,
	type AudioSourceKind,
	useAudioBus,
} from "@/lib/audio/audioBus";
import { getSharedContext } from "@/lib/hooks/useAudioPlayer";

let sourceCounter = 0;
function nextId(prefix: string) {
	sourceCounter += 1;
	return `${prefix}-${sourceCounter}-${Date.now()}`;
}

interface BaseSourceOptions {
	label: string;
	volume?: number;
}

function makeGain(ctx: AudioContext, volume: number): GainNode {
	const gain = ctx.createGain();
	gain.gain.value = volume;
	return gain;
}

export interface RegisteredSource {
	id: string;
	unregister: () => void;
	setVolume: (v: number) => void;
	setMuted: (m: boolean) => void;
}

function commit(id: string, source: AudioSource): RegisteredSource {
	useAudioBus.getState().registerSource(source);
	return {
		id,
		unregister: () => useAudioBus.getState().unregisterSource(id),
		setVolume: (v) => useAudioBus.getState().setSourceVolume(id, v),
		setMuted: (m) => useAudioBus.getState().setSourceMuted(id, m),
	};
}

export function registerFileSource(
	url: string,
	opts: BaseSourceOptions,
): RegisteredSource | null {
	const ctx = getSharedContext();
	if (!ctx) {
		return null;
	}
	const el = new Audio(url);
	el.crossOrigin = "anonymous";
	el.loop = false;
	el.preload = "none";
	let node: MediaElementAudioSourceNode;
	try {
		node = ctx.createMediaElementSource(el);
	} catch {
		// Element already bound to a source (re-play) — no second binding.
		return null;
	}
	const gain = makeGain(ctx, opts.volume ?? 1);
	node.connect(gain);
	gain.connect(ctx.destination);
	const source: AudioSource = {
		id: nextId("file"),
		label: opts.label,
		kind: "file" as AudioSourceKind,
		outputNode: node,
		gainNode: gain,
		volume: opts.volume ?? 1,
		muted: false,
		isLive: false,
		dispose: () => {
			try {
				node.disconnect();
			} catch {
				// Already disconnected.
			}
			try {
				gain.disconnect();
			} catch {
				// Already disconnected.
			}
			el.pause();
			el.src = "";
		},
	};
	const handle = commit(source.id, source);
	const prevUnregister = handle.unregister;
	return {
		...handle,
		unregister: () => {
			try {
				source.dispose?.();
			} catch {
				// Dispose must never break unregister.
			}
			prevUnregister();
		},
	};
}

export function registerMicSource(
	opts: BaseSourceOptions,
): RegisteredSource | null {
	const ctx = getSharedContext();
	if (!ctx) {
		return null;
	}
	let stream: MediaStream | null = null;
	let node: MediaStreamAudioSourceNode | null = null;
	const gain = makeGain(ctx, opts.volume ?? 1);
	gain.connect(ctx.destination);
	const source: AudioSource = {
		id: nextId("mic"),
		label: opts.label,
		kind: "mic" as AudioSourceKind,
		outputNode: null as unknown as AudioNode,
		gainNode: gain,
		volume: opts.volume ?? 1,
		muted: false,
		isLive: true,
		dispose: () => {
			try {
				node?.disconnect();
			} catch {
				// Already disconnected.
			}
			try {
				gain.disconnect();
			} catch {
				// Already disconnected.
			}
			stream?.getTracks().forEach((t) => {
				t.stop();
			});
		},
	};
	const handle = commit(source.id, source);
	void navigator.mediaDevices
		.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
		.then((s) => {
			stream = s;
			node = ctx.createMediaStreamSource(s);
			source.outputNode = node;
			node.connect(gain);
		})
		.catch(() => {
			// Surface failure by removing the placeholder source so consumers
			// never see a mic with a null outputNode.
			try {
				source.dispose?.();
			} catch {
				// Dispose must never break cleanup.
			}
			handle.unregister();
		});
	return handle;
}

export function registerVideoSource(
	videoEl: HTMLVideoElement,
	opts: BaseSourceOptions,
): RegisteredSource | null {
	const ctx = getSharedContext();
	if (!ctx) {
		return null;
	}
	const node = ctx.createMediaElementSource(videoEl);
	const source: AudioSource = {
		id: nextId("video"),
		label: opts.label,
		kind: "video" as AudioSourceKind,
		outputNode: node,
		gainNode: makeGain(ctx, opts.volume ?? 1),
		volume: opts.volume ?? 1,
		muted: false,
		isLive: true,
		dispose: () => {
			node.disconnect();
		},
	};
	return commit(source.id, source);
}

export function registerAssistantSource(
	el: HTMLAudioElement,
	opts: BaseSourceOptions,
): RegisteredSource | null {
	const ctx = getSharedContext();
	if (!ctx) {
		return null;
	}
	const node = ctx.createMediaElementSource(el);
	const source: AudioSource = {
		id: nextId("assistant"),
		label: opts.label,
		kind: "assistant" as AudioSourceKind,
		outputNode: node,
		gainNode: makeGain(ctx, opts.volume ?? 1),
		volume: opts.volume ?? 1,
		muted: false,
		isLive: false,
		dispose: () => {
			el.pause();
			el.src = "";
		},
	};
	return commit(source.id, source);
}
