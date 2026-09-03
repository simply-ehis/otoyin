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
	const node = ctx.createMediaElementSource(el);
	const source: AudioSource = {
		id: nextId("file"),
		label: opts.label,
		kind: "file" as AudioSourceKind,
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

export function registerMicSource(
	opts: BaseSourceOptions,
): RegisteredSource | null {
	const ctx = getSharedContext();
	if (!ctx) {
		return null;
	}
	let stream: MediaStream | null = null;
	let node: MediaStreamAudioSourceNode | null = null;
	const source: AudioSource = {
		id: nextId("mic"),
		label: opts.label,
		kind: "mic" as AudioSourceKind,
		outputNode: null as unknown as AudioNode,
		gainNode: makeGain(ctx, opts.volume ?? 1),
		volume: opts.volume ?? 1,
		muted: false,
		isLive: true,
		dispose: () => {
			node?.disconnect();
			stream?.getTracks().forEach((t) => {
				t.stop();
			});
		},
	};
	void navigator.mediaDevices
		.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
		.then((s) => {
			stream = s;
			node = ctx.createMediaStreamSource(s);
			source.outputNode = node;
			source.outputNode.connect(source.gainNode);
			source.gainNode.connect(ctx.destination);
		})
		.catch((err) => {
			console.error("Microphone source failed:", err);
		});
	return commit(source.id, source);
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
