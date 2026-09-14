import type { PluginChainItem } from "./AudioStudioStore";
import { makeImpulseResponse } from "./makeImpulseResponse";

interface EffectNode {
	input: AudioNode;
	output: AudioNode;
}

export function buildEffectChain(
	ctx: BaseAudioContext,
	pluginChain: PluginChainItem[],
): { input: AudioNode; output: AudioNode } | null {
	const enabled = pluginChain.filter((p) => p.enabled);
	if (!enabled.length) {
		return null;
	}
	const effects: EffectNode[] = [];
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
			const lowGain = p.params.low_gain ?? 0;
			const midGain = p.params.mid_gain ?? 0;
			const highGain = p.params.high_gain ?? 0;
			const low = ctx.createBiquadFilter();
			low.type = "lowshelf";
			low.frequency.value = 300;
			low.gain.value = lowGain;
			const mid = ctx.createBiquadFilter();
			mid.type = "peaking";
			mid.frequency.value = 2650;
			mid.gain.value = midGain;
			mid.Q.value = 0.7;
			const high = ctx.createBiquadFilter();
			high.type = "highshelf";
			high.frequency.value = 5000;
			high.gain.value = highGain;
			low.connect(mid).connect(high);
			effects.push({ input: low, output: high });
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
	return { input: effects[0].input, output: effects[effects.length - 1].output };
}
