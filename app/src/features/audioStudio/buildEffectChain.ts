import type { PluginChainItem } from "./AudioStudioStore";
import { makeImpulseResponse } from "./makeImpulseResponse";
export function buildEffectChain(
	ctx: BaseAudioContext,
	pluginChain: PluginChainItem[],
): { input: AudioNode; output: AudioNode } | null {
	const enabled = pluginChain.filter((p) => p.enabled);
	if (!enabled.length) {
		return null;
	}
	const nodes: AudioNode[] = [];
	for (const p of enabled) {
		const id = p.pluginId.replace(/^builtin-/, "");
		if (id === "reverb") {
			// Parallel wet/dry: `mix` is the wet/dry balance (0 = dry, 1 = full wet).
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
			nodes.push(input, output);
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
			nodes.push(low, mid, high);
		} else if (id === "delay") {
			// Parallel wet/dry: `mix` balances dry vs delayed (feedback) signal.
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
			nodes.push(input, output);
		} else if (id === "compressor") {
			nodes.push(ctx.createDynamicsCompressor());
		} else if (id === "gain") {
			const g = ctx.createGain();
			g.gain.value = p.params.gain ?? 1.0;
			nodes.push(g);
		}
	}
	if (!nodes.length) {
		return null;
	}
	for (let i = 0; i < nodes.length - 1; i++) {
		nodes[i].connect(nodes[i + 1]);
	}
	return { input: nodes[0], output: nodes[nodes.length - 1] };
}
