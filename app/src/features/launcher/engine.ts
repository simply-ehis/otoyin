/**
 * Ported from Resonant (https://github.com/calesthio/Resonant).
 * Copyright (c) 2026 Resonant and Calesthio. Licensed under AGPL-3.0-only.
 * WebAudio scheduling engine adapted for otoyin: session-mode only (no
 * arrangement), audio clips decoded from backend URLs, no instrument/SoundFont
 * support (Phase 3).
 */
import type {
	AudioClip,
	Clip,
	EngineState,
	LauncherSession,
	Track,
} from "./types";

interface EngineOptions {
	activeClips: Record<string, string | null>;
	metronome?: boolean;
}

export class LiveEngine {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private compressor: DynamicsCompressorNode | null = null;
	private timer: number | null = null;
	private startedAt = 0;
	private startBeat = 0;
	private nextStep = 0;
	private project: LauncherSession | null = null;
	private options: EngineOptions = { activeClips: {} };
	private sources = new Set<AudioScheduledSourceNode>();
	private decoded = new Map<string, AudioBuffer>();
	private decoding = new Map<string, Promise<AudioBuffer>>();
	private loopEnabled = true;
	private loopStartBeat = 0;
	private loopEndBeat = 16;

	async prepare() {
		if (!this.context) {
			this.context = new AudioContext({ latencyHint: "interactive" });
			this.master = this.context.createGain();
			this.compressor = this.context.createDynamicsCompressor();
			this.compressor.threshold.value = -3;
			this.compressor.knee.value = 8;
			this.compressor.ratio.value = 10;
			this.compressor.attack.value = 0.003;
			this.compressor.release.value = 0.18;
			this.master.connect(this.compressor).connect(this.context.destination);
		}
		if (this.context.state === "suspended") {
			await this.context.resume();
		}
		return this.context;
	}

	async play(
		project: LauncherSession,
		activeClips: Record<string, string | null>,
	) {
		const context = await this.prepare();
		this.stop();
		this.project = structuredClone(project);
		this.options = { activeClips: { ...activeClips } };
		this.loopEnabled = true;
		this.loopStartBeat = 0;
		this.loopEndBeat = project.numScenes * 4;
		this.startBeat = 0;
		this.startedAt = context.currentTime + 0.035;
		this.nextStep = 0;
		if (this.master) {
			this.master.gain.value = project.masterVolume;
		}
		await this.cacheAudio(project);
		this.tick();
		this.timer = window.setInterval(() => this.tick(), 25);
	}

	stop() {
		if (this.timer !== null) {
			window.clearInterval(this.timer);
		}
		this.timer = null;
		for (const source of this.sources) {
			try {
				source.stop();
			} catch {
				/* already stopped */
			}
		}
		this.sources.clear();
	}

	isPlaying() {
		return this.timer !== null;
	}

	getCurrentBeat(): number {
		if (!this.context || !this.isPlaying() || !this.project) {
			return this.startBeat;
		}
		return (
			this.startBeat +
			(Math.max(0, this.context.currentTime - this.startedAt) *
				this.project.bpm) /
				60
		);
	}

	getLatency(): number | null {
		return this.context
			? Math.round(
					(this.context.baseLatency + (this.context.outputLatency || 0)) * 1000,
				)
			: null;
	}

	setActiveClips(activeClips: Record<string, string | null>) {
		this.options.activeClips = { ...activeClips };
	}

	getEngineState(): EngineState {
		return {
			playing: this.isPlaying(),
			beat: this.getCurrentBeat(),
			mode: "session",
			activeClips: { ...this.options.activeClips },
		};
	}

	private async cacheAudio(project: LauncherSession) {
		if (!this.context) {
			return;
		}
		const audioIds = new Set(
			Object.values(project.clips)
				.filter((clip): clip is AudioClip => clip.type === "audio")
				.map((clip) => clip.id),
		);
		for (const id of this.decoded.keys()) {
			if (!audioIds.has(id)) {
				this.decoded.delete(id);
			}
		}
		const fetches: Promise<void>[] = [];
		for (const clip of Object.values(project.clips)) {
			if (clip.type !== "audio") {
				continue;
			}
			if (this.decoded.has(clip.id)) {
				continue;
			}
			if (this.decoding.has(clip.id)) {
				const p = this.decoding.get(clip.id);
				if (p) {
					fetches.push(p.then(() => {}));
				}
				continue;
			}
			const promise = this.decodeClip(clip);
			this.decoding.set(clip.id, promise);
			fetches.push(promise.then(() => {}));
		}
		await Promise.all(fetches);
	}

	private async decodeClip(clip: AudioClip): Promise<AudioBuffer> {
		if (!this.context) {
			throw new Error("AudioContext not ready");
		}
		const baseUrl = window.location.origin;
		const url = clip.audioPath.startsWith("http")
			? clip.audioPath
			: `${baseUrl}${clip.audioPath}`;
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch audio for ${clip.name}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		const buffer = await this.context.decodeAudioData(arrayBuffer);
		this.decoded.set(clip.id, buffer);
		this.decoding.delete(clip.id);
		return buffer;
	}

	private tick() {
		const context = this.context;
		const project = this.project;
		if (!context || !project || !this.master) {
			return;
		}
		let horizonBeat =
			this.startBeat +
			((context.currentTime + 0.12 - this.startedAt) * project.bpm) / 60;
		while (this.nextStep / 4 <= horizonBeat) {
			let beat = this.nextStep / 4;
			let wrapped = false;
			if (this.loopEnabled && beat >= this.loopEndBeat) {
				this.startBeat = this.loopStartBeat;
				this.startedAt = context.currentTime + 0.02;
				this.nextStep = Math.ceil(this.loopStartBeat * 4 - 1e-9);
				beat = this.nextStep / 4;
				horizonBeat =
					this.startBeat +
					((context.currentTime + 0.12 - this.startedAt) * project.bpm) / 60;
				wrapped = true;
			}
			const when =
				this.startedAt + ((beat - this.startBeat) * 60) / project.bpm;
			this.scheduleAtStep(
				project,
				beat,
				Math.max(context.currentTime + 0.005, when),
			);
			this.nextStep++;
			if (wrapped) {
				break;
			}
		}
	}

	private scheduleAtStep(project: LauncherSession, beat: number, when: number) {
		const anySolo = project.tracks.some((t) => t.solo);
		for (const track of project.tracks) {
			if (track.mute || (anySolo && !track.solo)) {
				continue;
			}
			const clipId = this.options.activeClips[track.id];
			const clip = clipId ? project.clips[clipId] : undefined;
			if (clip) {
				this.scheduleClip(
					clip,
					track,
					((beat % clip.lengthBeats) + clip.lengthBeats) % clip.lengthBeats,
					when,
					project.bpm,
				);
			}
		}
	}

	private scheduleClip(
		clip: Clip,
		track: Track,
		localBeat: number,
		when: number,
		bpm: number,
	) {
		if (clip.type === "midi") {
			const step =
				Math.round(localBeat * 4) %
				Math.max(1, Math.round(clip.lengthBeats * 4));
			for (const note of clip.notes.filter((n) => n.step === step)) {
				this.scheduleMidi(
					note.pitch,
					note.velocity * (clip.volumeAutomation[step] ?? 1),
					note.durationSteps,
					track,
					when,
					bpm,
				);
			}
			return;
		}
		const startingTransport = this.nextStep === 0;
		const step =
			Math.round(localBeat * 4) % Math.max(1, Math.round(clip.lengthBeats * 4));
		if (step === 0 || startingTransport) {
			this.scheduleAudio(
				clip,
				track,
				when,
				startingTransport ? localBeat : 0,
				bpm,
			);
		}
	}

	private trackOutput(track: Track, when: number) {
		const context = this.context;
		const master = this.master;
		if (!context || !master) {
			throw new Error("Engine not prepared");
		}
		const gain = context.createGain();
		const pan = context.createStereoPanner();
		gain.gain.setValueAtTime(track.volume, when);
		pan.pan.setValueAtTime(track.pan, when);
		gain.connect(pan).connect(master);
		const dispose = () => {
			gain.disconnect();
			pan.disconnect();
		};
		return { input: gain, dispose, tailMs: 0 };
	}

	private scheduleMidi(
		pitch: number,
		velocity: number,
		durationSteps: number,
		track: Track,
		when: number,
		bpm: number,
	) {
		const context = this.context;
		if (!context) {
			throw new Error("Engine not prepared");
		}
		const output = this.trackOutput(track, when);
		const duration = (durationSteps * 0.25 * 60) / bpm;
		const envelope = context.createGain();
		const filter = context.createBiquadFilter();
		envelope.gain.setValueAtTime(0.0001, when);
		envelope.gain.exponentialRampToValueAtTime(
			Math.max(0.001, velocity),
			when + 0.003,
		);
		envelope.gain.setValueAtTime(Math.max(0.001, velocity), when + duration);
		envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.28);
		filter.type = "lowpass";
		filter.frequency.value = 4200;
		filter.Q.value = 0.8;
		envelope.connect(filter).connect(output.input);
		let source: AudioScheduledSourceNode;
		if (track.kind === "drum" && pitch > 36) {
			const buffer = context.createBuffer(
				1,
				Math.floor(context.sampleRate * 0.25),
				context.sampleRate,
			);
			const data = buffer.getChannelData(0);
			for (let i = 0; i < data.length; i++) {
				data[i] = Math.random() * 2 - 1;
			}
			const noise = context.createBufferSource();
			noise.buffer = buffer;
			source = noise;
		} else {
			const oscillator = context.createOscillator();
			oscillator.type = track.kind === "drum" ? "sine" : "triangle";
			oscillator.frequency.setValueAtTime(440 * 2 ** ((pitch - 69) / 12), when);
			if (track.kind === "drum") {
				oscillator.frequency.exponentialRampToValueAtTime(42, when + 0.09);
			}
			source = oscillator;
		}
		source.connect(envelope);
		this.sources.add(source);
		source.onended = () => {
			this.sources.delete(source);
			envelope.disconnect();
			filter.disconnect();
			output.dispose();
		};
		source.start(when);
		source.stop(when + duration + 0.31);
	}

	private scheduleAudio(
		clip: AudioClip,
		track: Track,
		when: number,
		localBeat: number,
		bpm: number,
	) {
		const buffer = this.decoded.get(clip.id);
		if (!buffer) {
			return;
		}
		const context = this.context;
		if (!context) {
			return;
		}
		const source = context.createBufferSource();
		const gain = context.createGain();
		const output = this.trackOutput(track, when);
		const usableDuration = Math.max(
			1 / buffer.sampleRate,
			buffer.duration - clip.trimStart - clip.trimEnd,
		);
		const beatFraction = Math.max(0, Math.min(1, localBeat / clip.lengthBeats));
		const sourceOffset = clip.trimStart + usableDuration * beatFraction;
		const sourceDuration = Math.max(
			1 / buffer.sampleRate,
			usableDuration * (1 - beatFraction),
		);
		const targetDuration = Math.max(
			0.01,
			((clip.lengthBeats - localBeat) * 60) / bpm,
		);
		source.buffer = buffer;
		source.playbackRate.value = sourceDuration / targetDuration;
		gain.gain.value = clip.gain;
		source.connect(gain).connect(output.input);
		this.sources.add(source);
		source.onended = () => {
			this.sources.delete(source);
			gain.disconnect();
			output.dispose();
		};
		source.start(when, sourceOffset, sourceDuration);
		source.stop(when + targetDuration + 0.02);
	}
}

export const liveEngine = new LiveEngine();
