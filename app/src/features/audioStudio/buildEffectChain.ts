import type { PluginChainItem } from "./AudioStudioStore";
import { makeImpulseResponse } from "./makeImpulseResponse";

interface EffectNode {
	input: AudioNode;
	output: AudioNode;
	/** Stop scheduled sources (LFOs). Called on teardown; safe to omit. */
	dispose?: () => void;
}

/** Parametric EQ band: computes the magnitude response for the visualizer. */
export function eqBandResponse(
	freq: number,
	center: number,
	gain: number,
	q: number,
	type: BiquadFilterType,
): number {
	if (gain === 0) {
		return 0;
	}
	const ratio = freq / center;
	const qSq = q * q;
	if (type === "lowshelf" || type === "highshelf") {
		const shelfQ = Math.max(q, Math.SQRT1_2);
		const a = 10 ** (gain / 40);
		const sqNorm = (freq / (center * shelfQ)) ** 2;
		const shift = Math.log10(1 + sqNorm * (a * a - 1));
		if (type === "lowshelf") {
			return freq < center * 2 ? gain * Math.min(shift, 1) : 0;
		}
		return freq > center / 2 ? gain * Math.min(shift, 1) : 0;
	}
	return gain / (1 + qSq * (ratio - 1 / ratio) ** 2);
}

/** Default EQ band definitions. */
export const EQ_BANDS = [
	{
		key: "low",
		label: "Low",
		type: "lowshelf" as BiquadFilterType,
		defaultFreq: 100,
		defaultQ: Math.SQRT1_2,
	},
	{
		key: "mid1",
		label: "Mid 1",
		type: "peaking" as BiquadFilterType,
		defaultFreq: 1000,
		defaultQ: 1.0,
	},
	{
		key: "mid2",
		label: "Mid 2",
		type: "peaking" as BiquadFilterType,
		defaultFreq: 3000,
		defaultQ: 1.0,
	},
	{
		key: "high",
		label: "High",
		type: "highshelf" as BiquadFilterType,
		defaultFreq: 8000,
		defaultQ: Math.SQRT1_2,
	},
] as const;

export function buildEffectChain(
	ctx: BaseAudioContext,
	pluginChain: PluginChainItem[],
): { input: AudioNode; output: AudioNode; dispose: () => void } | null {
	const enabled = pluginChain.filter((p) => p.enabled);
	if (!enabled.length) {
		return null;
	}
	const effects: EffectNode[] = [];
	const stopAll = () => {
		for (const fx of effects) {
			try {
				fx.dispose?.();
			} catch {
				// Already disposed.
			}
		}
	};
	for (const p of enabled) {
		const id = p.pluginId.replace(/^builtin-/, "");
		if (id === "reverb") {
			const mix = p.params.mix ?? 0.3;
			const input = ctx.createGain();
			const output = ctx.createGain();
			const dry = ctx.createGain();
			dry.gain.value = 1 - mix;
			input.connect(dry).connect(output);
			const conv = ctx.createConvolver();
			conv.buffer = makeImpulseResponse(ctx, 1.5);
			const wet = ctx.createGain();
			wet.gain.value = mix;
			input.connect(conv).connect(wet).connect(output);
			effects.push({ input, output });
		} else if (id === "eq" || id === "equalizer") {
			let prev: BiquadFilterNode | null = null;
			let first: BiquadFilterNode | null = null;
			for (const band of EQ_BANDS) {
				const filter = ctx.createBiquadFilter();
				filter.type = band.type;
				filter.frequency.value =
					(p.params[`${band.key}_freq`] as number) ?? band.defaultFreq;
				filter.gain.value = (p.params[`${band.key}_gain`] as number) ?? 0;
				filter.Q.value = (p.params[`${band.key}_q`] as number) ?? band.defaultQ;
				if (prev) {
					prev.connect(filter);
				} else {
					first = filter;
				}
				prev = filter;
			}
			if (first && prev) {
				effects.push({ input: first, output: prev });
			}
		} else if (id === "delay") {
			const mix = p.params.mix ?? 0.5;
			const input = ctx.createGain();
			const output = ctx.createGain();
			const dry = ctx.createGain();
			dry.gain.value = 1 - mix;
			input.connect(dry).connect(output);
			const delay = ctx.createDelay(1.0);
			delay.delayTime.value = p.params.time ?? 0.3;
			const fb = ctx.createGain();
			fb.gain.value = p.params.feedback ?? 0.3;
			delay.connect(fb).connect(delay);
			const wet = ctx.createGain();
			wet.gain.value = mix;
			input.connect(delay).connect(wet).connect(output);
			effects.push({ input, output });
		} else if (id === "compressor") {
			const comp = ctx.createDynamicsCompressor();
			comp.threshold.value = p.params.threshold ?? -24;
			comp.ratio.value = p.params.ratio ?? 12;
			comp.attack.value = (p.params.attack ?? 3) / 1000;
			comp.release.value = (p.params.release ?? 250) / 1000;
			effects.push({ input: comp, output: comp });
		} else if (id === "chorus") {
			// Registry dialect: rate_hz + depth 0-1 around centre_delay_ms.
			const rate = (p.params.rate_hz as number) ?? 1.0;
			const centreMs = (p.params.centre_delay_ms as number) ?? 7;
			const depthFrac = (p.params.depth as number) ?? 0.5;
			const mix = (p.params.mix as number) ?? 0.5;
			const feedback = (p.params.feedback as number) ?? 0;
			const input = ctx.createGain();
			const output = ctx.createGain();
			const dry = ctx.createGain();
			dry.gain.value = 1 - mix;
			input.connect(dry).connect(output);
			const delay = ctx.createDelay(0.1);
			delay.delayTime.value = centreMs / 1000;
			const lfo = ctx.createOscillator();
			lfo.type = "sine";
			lfo.frequency.value = rate;
			const lfoGain = ctx.createGain();
			lfoGain.gain.value = (depthFrac * centreMs) / 1000;
			lfo.connect(lfoGain).connect(delay.delayTime);
			try {
				lfo.start();
			} catch {
				// Already started.
			}
			input.connect(delay);
			if (feedback > 0) {
				const fb = ctx.createGain();
				fb.gain.value = Math.min(feedback, 0.9);
				delay.connect(fb).connect(delay);
			}
			const wet = ctx.createGain();
			wet.gain.value = mix;
			delay.connect(wet).connect(output);
			effects.push({
				input,
				output,
				dispose: () => {
					try {
						lfo.stop();
					} catch {
						// Already stopped.
					}
					try {
						lfo.disconnect();
					} catch {
						// Already disconnected.
					}
				},
			});
		} else if (id === "distortion") {
			// Mirrors backend tanh soft-clip: dry*(1-mix) + tanh(x*gain)*mix.
			const drive = (p.params.gain as number) ?? 2.0;
			const mix = (p.params.mix as number) ?? 0.5;
			const input = ctx.createGain();
			const output = ctx.createGain();
			const dry = ctx.createGain();
			dry.gain.value = 1 - mix;
			input.connect(dry).connect(output);
			const shaper = ctx.createWaveShaper();
			const curve = new Float32Array(256);
			for (let i = 0; i < curve.length; i++) {
				const x = (i / (curve.length - 1)) * 2 - 1;
				curve[i] = Math.tanh(x * drive);
			}
			shaper.curve = curve;
			const wet = ctx.createGain();
			wet.gain.value = mix;
			input.connect(shaper).connect(wet).connect(output);
			effects.push({ input, output });
		} else if (id === "telephone") {
			// Mirrors backend: bandpass → compressor → makeup gain.
			const lowCut = (p.params.low_cutoff as number) ?? 300;
			const highCut = (p.params.high_cutoff as number) ?? 3500;
			const ratio = (p.params.compression as number) ?? 6;
			const gainDb = (p.params.gain_db as number) ?? 6;
			const hp = ctx.createBiquadFilter();
			hp.type = "highpass";
			hp.frequency.value = lowCut;
			const lp = ctx.createBiquadFilter();
			lp.type = "lowpass";
			lp.frequency.value = highCut;
			const comp = ctx.createDynamicsCompressor();
			comp.threshold.value = -15;
			comp.ratio.value = ratio;
			comp.attack.value = 0.005;
			comp.release.value = 0.05;
			const makeup = ctx.createGain();
			makeup.gain.value = 10 ** (gainDb / 20);
			hp.connect(lp).connect(comp).connect(makeup);
			effects.push({ input: hp, output: makeup });
		} else if (id === "megaphone") {
			// Mirrors backend: bandpass → tanh drive → compressor.
			const lowCut = (p.params.low_cutoff as number) ?? 400;
			const highCut = (p.params.high_cutoff as number) ?? 2500;
			const drive = (p.params.distortion_gain as number) ?? 4.0;
			const hp = ctx.createBiquadFilter();
			hp.type = "highpass";
			hp.frequency.value = lowCut;
			const lp = ctx.createBiquadFilter();
			lp.type = "lowpass";
			lp.frequency.value = highCut;
			const shaper = ctx.createWaveShaper();
			const curve = new Float32Array(256);
			for (let i = 0; i < curve.length; i++) {
				const x = (i / (curve.length - 1)) * 2 - 1;
				curve[i] = Math.tanh(x * drive);
			}
			shaper.curve = curve;
			const comp = ctx.createDynamicsCompressor();
			comp.threshold.value = -10;
			comp.ratio.value = 8;
			comp.attack.value = 0.002;
			comp.release.value = 0.02;
			hp.connect(lp).connect(shaper).connect(comp);
			effects.push({ input: hp, output: comp });
		} else if (id === "resonant_filter_sweep") {
			// LFO sweeps the cutoff between start/end; resonance → Q.
			const start = (p.params.cutoff_start as number) ?? 200;
			const end = (p.params.cutoff_end as number) ?? 8000;
			const resonance = (p.params.resonance as number) ?? 0.5;
			const lfoRate = (p.params.lfo_rate as number) ?? 0.5;
			// Numeric from the panel slider (0/1/2); accept engine strings too.
			const typeParam: unknown = p.params.filter_type ?? 0;
			const filterType: BiquadFilterType =
				typeParam === 1 || typeParam === "highpass"
					? "highpass"
					: typeParam === 2 || typeParam === "bandpass"
						? "bandpass"
						: "lowpass";
			const filter = ctx.createBiquadFilter();
			filter.type = filterType;
			filter.frequency.value = (start + end) / 2;
			filter.Q.value = 0.5 + resonance * 9.5;
			const lfo = ctx.createOscillator();
			lfo.type = "sine";
			lfo.frequency.value = lfoRate;
			const lfoGain = ctx.createGain();
			lfoGain.gain.value = Math.abs(end - start) / 2;
			lfo.connect(lfoGain).connect(filter.frequency);
			try {
				lfo.start();
			} catch {
				// Already started.
			}
			effects.push({
				input: filter,
				output: filter,
				dispose: () => {
					try {
						lfo.stop();
					} catch {
						// Already stopped.
					}
					try {
						lfo.disconnect();
					} catch {
						// Already disconnected.
					}
				},
			});
		} else if (id === "gain") {
			const g = ctx.createGain();
			g.gain.value = p.params.gain ?? 1.0;
			effects.push({ input: g, output: g });
		}
	}
	if (!effects.length) {
		return null;
	}
	for (let i = 0; i < effects.length - 1; i++) {
		effects[i].output.connect(effects[i + 1].input);
	}
	return {
		input: effects[0].input,
		output: effects[effects.length - 1].output,
		dispose: stopAll,
	};
}
