/**
 * Offline instrument render for launcher MIDI clips, ported from Resonant
 * (© 2026 Calesthio, AGPL-3.0-only). Adapted for otoyin's LauncherSession
 * model — no arrangement blocks, resolves instruments by track kind.
 */
import type { LauncherSession, MidiClip, Track } from "../launcher/types";
import { chooseZone } from "./chooseZone";
import {
	type PreparedInstrument,
	type PreparedSampler,
	prepareInstrument,
	renderSoundFontNote,
} from "./instrumentPlayback";
import type { ResolvedInstrument } from "./types";

// ─── Time utilities (ported from Resonant time.ts) ───────────────────────────

const STEPS_PER_BEAT = 4;

const stepToBeat = (step: number) => step / STEPS_PER_BEAT;

const beatToSample = (beat: number, bpm: number, sampleRate: number) =>
	Math.round(((beat * 60) / bpm) * sampleRate);

// ─── Render result ───────────────────────────────────────────────────────────

export interface RenderResult {
	left: Float32Array;
	right: Float32Array;
	sampleRate: number;
}

// ─── Resolver type ───────────────────────────────────────────────────────────

export type InstrumentResolver = (
	track: Track,
) => Promise<ResolvedInstrument | PreparedInstrument | null>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDelay(
	result: RenderResult,
	index: number,
	left: number,
	right: number,
	_pan: number,
	delayMix: number,
	bpm: number,
) {
	if (index < 0 || index >= result.left.length) {
		return;
	}
	result.left[index] += left;
	result.right[index] += right;
	if (delayMix <= 0) {
		return;
	}
	const delayed = index + Math.floor(((result.sampleRate * 60) / bpm) * 0.75);
	if (delayed < result.left.length) {
		result.left[delayed] += left * delayMix * 0.38;
		result.right[delayed] += right * delayMix * 0.38;
	}
}

function panStereo(pan: number): [number, number] {
	const angle = ((pan + 1) * Math.PI) / 4;
	return [Math.cos(angle), Math.sin(angle)];
}

function addSamplerNote(
	result: RenderResult,
	prepared: PreparedSampler,
	track: Track,
	pitch: number,
	velocity: number,
	start: number,
	duration: number,
	automation: number,
	bpm: number,
) {
	const zone = chooseZone(prepared.zones, pitch, velocity);
	if (!zone || !("buffer" in zone)) {
		return;
	}
	const buffer = zone.buffer as AudioBuffer;
	const root = zone.rootKey ?? Math.round((zone.originalPitch ?? 6000) / 100);
	const cents =
		(pitch - root) * 100 -
		(zone.coarseTune ?? 0) * 100 -
		(zone.fineTune ?? zone.tune ?? 0);
	const playbackRate = 2 ** (cents / 1200);
	const sourceFrames = buffer.length;
	const maxFrames = zone.oneShot
		? Math.ceil(sourceFrames / playbackRate)
		: Math.ceil((duration + 0.3) * result.sampleRate);
	const gain =
		velocity * automation * track.volume * 10 ** ((zone.gainDb ?? 0) / 20);
	const [panL, panR] = panStereo(track.pan);

	for (
		let frame = 0;
		frame < maxFrames && start + frame < result.left.length;
		frame++
	) {
		let sourceIndex = Math.floor(
			(frame * playbackRate * buffer.sampleRate) / result.sampleRate,
		);
		if (sourceIndex >= sourceFrames) {
			if (
				zone.loopMode &&
				!["no_loop", "one_shot"].includes(zone.loopMode) &&
				(zone.loopEnd ?? 0) > (zone.loopStart ?? 0)
			) {
				const loopLen = (zone.loopEnd ?? sourceFrames) - (zone.loopStart ?? 0);
				sourceIndex =
					(zone.loopStart ?? 0) +
					((sourceIndex - (zone.loopStart ?? 0)) % loopLen);
			} else {
				break;
			}
		}
		const t = frame / result.sampleRate;
		const release =
			zone.oneShot || t <= duration
				? 1
				: Math.max(0, 1 - (t - duration) / Math.max(0.02, 0.3));
		const left = buffer.getChannelData(0)[sourceIndex] ?? 0;
		const right =
			buffer.numberOfChannels > 1
				? (buffer.getChannelData(1)[sourceIndex] ?? left)
				: left;
		addDelay(
			result,
			start + frame,
			left * gain * release * panL,
			right * gain * release * panR,
			track.pan,
			0,
			bpm,
		);
	}
}

function noteEvents(
	clip: MidiClip,
	startBeat: number,
	blockLength: number,
	offsetBeats: number,
) {
	const events: Array<{
		pitch: number;
		velocity: number;
		durationSteps: number;
		beat: number;
		automation: number;
	}> = [];
	const loops = Math.ceil((blockLength + offsetBeats) / clip.lengthBeats);
	for (let loop = 0; loop < loops; loop++) {
		for (const note of clip.notes) {
			const relativeBeat =
				loop * clip.lengthBeats + stepToBeat(note.step) - offsetBeats;
			if (relativeBeat < 0 || relativeBeat >= blockLength) {
				continue;
			}
			events.push({
				pitch: note.pitch,
				velocity: note.velocity,
				durationSteps: note.durationSteps,
				beat: startBeat + relativeBeat,
				automation: clip.volumeAutomation[note.step] ?? 1,
			});
		}
	}
	return events;
}

// ─── Main render function ────────────────────────────────────────────────────

export async function renderSessionWithInstruments(
	session: LauncherSession,
	activeClips: Record<string, string | null>,
	resolver: InstrumentResolver,
	decodeContext: BaseAudioContext,
	sampleRate = 44100,
): Promise<RenderResult> {
	const totalBeats = session.numScenes * 4;
	const totalFrames = beatToSample(totalBeats, session.bpm, sampleRate);
	const result: RenderResult = {
		left: new Float32Array(totalFrames),
		right: new Float32Array(totalFrames),
		sampleRate,
	};

	const anySolo = session.tracks.some((t) => t.solo);
	const prepared = new Map<string, PreparedInstrument>();

	// Resolve instruments for active tracks
	for (const track of session.tracks) {
		if (track.mute) {
			continue;
		}
		if (anySolo && !track.solo) {
			continue;
		}
		if (prepared.has(track.id)) {
			continue;
		}

		const resolved = await resolver(track);
		if (!resolved) {
			continue;
		}
		prepared.set(
			track.id,
			"kind" in resolved
				? resolved
				: await prepareInstrument(decodeContext, resolved),
		);
	}

	const soundFontCache = new Map<
		string,
		Awaited<ReturnType<typeof renderSoundFontNote>>
	>();

	// Render each active MIDI clip
	for (const track of session.tracks) {
		if (track.mute) {
			continue;
		}
		if (anySolo && !track.solo) {
			continue;
		}

		const clipId = activeClips[track.id];
		if (!clipId) {
			continue;
		}
		const clip = session.clips[clipId];
		if (!clip || clip.type !== "midi") {
			continue;
		}

		const source = prepared.get(track.id);
		if (!source) {
			continue;
		}

		// Calculate beat offset from scene position
		const sceneIndex = clipId.includes("-scene-")
			? Number.parseInt(clipId.split("-scene-")[1] ?? "0", 10)
			: 0;
		const startBeat = sceneIndex * 4;

		for (const event of noteEvents(clip, startBeat, clip.lengthBeats, 0)) {
			const start = beatToSample(event.beat, session.bpm, sampleRate);
			const duration = (event.durationSteps * 0.25 * 60) / session.bpm;

			if (source.kind === "sampler") {
				addSamplerNote(
					result,
					source,
					track,
					event.pitch,
					event.velocity,
					start,
					duration,
					event.automation,
					session.bpm,
				);
			} else {
				const key = `${track.id}:${event.pitch}:${event.durationSteps}:${session.bpm}:${sampleRate}`;
				let note = soundFontCache.get(key);
				if (!note) {
					note = await renderSoundFontNote(
						source.data,
						source.instrument,
						event.pitch,
						duration,
						sampleRate,
					);
					soundFontCache.set(key, note);
				}
				const gain = event.velocity * event.automation * track.volume;
				const [panL, panR] = panStereo(track.pan);
				for (
					let frame = 0;
					frame < note.left.length && start + frame < result.left.length;
					frame++
				) {
					addDelay(
						result,
						start + frame,
						note.left[frame] * gain * panL,
						note.right[frame] * gain * panR,
						track.pan,
						0,
						session.bpm,
					);
				}
			}
		}
	}

	// Master volume + soft clip
	for (let frame = 0; frame < result.left.length; frame++) {
		result.left[frame] = Math.tanh(result.left[frame] * session.masterVolume);
		result.right[frame] = Math.tanh(result.right[frame] * session.masterVolume);
	}

	return result;
}
