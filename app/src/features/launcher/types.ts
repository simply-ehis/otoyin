/**
 * Ported from Resonant (https://github.com/calesthio/Resonant).
 * Copyright (c) 2026 Resonant and Calesthio. Licensed under AGPL-3.0-only.
 * Types adapted for otoyin: audio clips reference backend URLs, no arrangement
 * blocks (Phase 4), no Electron IPC assets.
 */

export type TrackKind = "drum" | "synth" | "sampler" | "audio";

export interface MidiNote {
	id: string;
	step: number;
	pitch: number;
	velocity: number;
	durationSteps: number;
}

export interface MidiClip {
	id: string;
	type: "midi";
	name: string;
	color: string;
	lengthBeats: number;
	notes: MidiNote[];
	volumeAutomation: number[];
}

export interface AudioClip {
	id: string;
	type: "audio";
	name: string;
	color: string;
	lengthBeats: number;
	sampleRate: number;
	channels: 1 | 2;
	frames: number;
	audioPath: string;
	waveformPeaks?: number[];
	trimStart: number;
	trimEnd: number;
	gain: number;
	volumeAutomation: number[];
}

export type Clip = MidiClip | AudioClip;

export interface Track {
	id: string;
	name: string;
	kind: TrackKind;
	color: string;
	volume: number;
	pan: number;
	mute: boolean;
	solo: boolean;
	sessionSlots: Array<string | null>;
	/** Instrument pack ID — when set, the engine uses sample-based playback. */
	instrumentId?: string;
	/** Program number within the pack (GM program change). */
	instrumentProgram?: number;
}

export interface LauncherSession {
	id: string;
	name: string;
	bpm: number;
	masterVolume: number;
	tracks: Track[];
	clips: Record<string, Clip>;
	numScenes: number;
	createdAt: string;
	modifiedAt: string;
}

export type PlayMode = "session";

export interface EngineState {
	playing: boolean;
	beat: number;
	mode: PlayMode;
	activeClips: Record<string, string | null>;
}
