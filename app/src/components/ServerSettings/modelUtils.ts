import type { HuggingFaceModelInfo } from "@/lib/api/types";

const AUDIO_EXTENSIONS = /\.(wav|mp3|ogg|flac|m4a)$/i;
const PREFERRED_HINTS = /(sample|demo|preview|example|test)/i;

/**
 * Find playable demo/sample audio files already checked into a HF repo.
 *
 * Reads HuggingFaceModelInfo.siblings (the repo's file list, already
 * returned by the model-info API call this app makes) rather than
 * hardcoding per-model URLs — works for any repo that happens to include
 * samples, present or future, and returns nothing (not a broken link) for
 * repos that don't. Files with "sample"/"demo"/etc. in the path are
 * surfaced first since those are almost always intentional demo clips
 * rather than incidental audio (e.g. training-adjacent files).
 */
export function findSampleAudioUrls(
	repoId: string,
	info: HuggingFaceModelInfo | undefined,
): string[] {
	const files =
		info?.siblings
			?.map((s) => s.rfilename)
			.filter((f) => AUDIO_EXTENSIONS.test(f)) ?? [];
	if (files.length === 0) {
		return [];
	}

	const sorted = [...files].sort((a, b) => {
		const aHint = PREFERRED_HINTS.test(a) ? 0 : 1;
		const bHint = PREFERRED_HINTS.test(b) ? 0 : 1;
		return aHint - bHint;
	});

	return sorted
		.slice(0, 3)
		.map((f) => `https://huggingface.co/${repoId}/resolve/main/${f}`);
}

export async function fetchHuggingFaceModelInfo(
	repoId: string,
): Promise<HuggingFaceModelInfo> {
	const response = await fetch(`https://huggingface.co/api/models/${repoId}`);
	if (!response.ok) {
		throw new Error(`Failed to fetch model info: ${response.status}`);
	}
	return response.json();
}

export const MODEL_DESCRIPTIONS: Record<string, string> = {
	"kokoro-onnx":
		"Kokoro 82M by hexgrad — the default Otoyin voice. Tiny 82M ONNX model that speaks in realtime on CPU, 45 warm preset voices across 8 languages, plus voice-mixing to blend your own. Apache 2.0, no PyTorch needed. Best starting point for podcasts, dialogue, and voice-overs.",
	"fish-speech-s1-mini":
		"Fish Speech S1-mini (0.5B) — CC-BY-NC-SA, free. Fast multilingual cloning from a 10-second clip. 13 languages, 44.1 kHz, emotion + voice design.",
	"fish-speech-s2-pro":
		"Fish Audio S2 Pro (4.5B GGUF) — SOTA Dual-AR TTS. 80+ languages, voice cloning from 10-30s, inline emotion tags ([whisper], [angry], etc). Slow-AR 4B + Fast-AR 0.4B. GPU or 24GB+ RAM.",
	"zonos-v0.1":
		"Zyphra ZonOS v0.1 — studio-grade zero-shot cloning with emotion, rate, and audio-prefix control. 23 languages, expressive delivery from a single reference. For dramatic reads and trailers.",
	"qwen3-tts-1.7b":
		"Qwen3-TTS 12Hz 1.7B (GGUF, Apache-2.0) — premium cloning via llama-tts sidecar. 10 languages, 24kHz, faithful timbre from a short sample. The upgrade when Kokoro isn't enough.",
	"bark-small":
		"Bark Small (GGUF, MIT) — 26 built-in speakers, 13 languages, plus laughs, sighs and music-aware generation. Runs via CrispASR one-shot, perfect for playful characters and sound-rich scenes.",
	styletts2:
		"StyleTTS2 — style-based TTS with a learned style encoder and differentiable duration. Expressive, stable pacing for long-form narration and audiobooks. 200–300% realtime on CPU.",
	"styletts2-onnx":
		"StyleTTS2 ONNX — same expressive voices, zero PyTorch. Five ONNX graphs run inside ONNX Runtime for a lighter install and faster cold start.",
	chattts:
		"ChatTTS — conversational TTS with [laugh], [break] and prosody tags. Ideal for dialogue, debates, and podcasts where timing and reaction matter.",
	"f5-tts":
		"F5-TTS Small — flow-matching zero-shot clone with no speaker embedding. Clean, faithful cloning from one clip, English + Mandarin focus.",
	"f5-tts-onnx":
		"F5-TTS ONNX — torch-free F5 with identical quality via ONNX Runtime. Good for CPU-only laptops.",
	"pocket-tts":
		"Pocket-TTS (100M) — compact CPU-realtime multilingual TTS for 6 European languages. Clone or pick 18 presets, <200MB download.",
	"pocket-tts-onnx":
		"Pocket-TTS ONNX — same 6 languages and presets, no torch required. The lightest clone-capable voice for travel laptops.",
	"moss-tts-nano":
		"MOSS-TTS-Nano 100M ONNX — 20+ languages in 763MB. Zero-shot cloning without PyTorch, ideal for multilingual UIs and edge devices.",
	"parler-tts-mini":
		'Parler-TTS Mini — "describe the voice" instead of cloning. Prompt it like "a warm, low, fast NPR host" and get a matching voice, 14 presets to start from.',
	"kitten-tts-mini":
		"KittenTTS mini (80MB, Apache-2.0) — the instant-voice. 8 presets, CPU-only, no dependencies, <1s to first audio. Perfect for quick drafts and low-end machines.",
	"neutts-2e-q4":
		"NeuTTS-2E Q4 — emotion-aware cloning with 4 speakers × 7 emotions (angry, happy, sad…). Q4 GGUF is the balanced pick; 24kHz, fast enough for batches.",
	"neutts-2e-q8":
		"NeuTTS-2E Q8 — same 4 speakers & 7 emotions, higher fidelity at larger size. Choose Q8 for final masters and Q4 for drafts.",
	"orpheus-q4-k-m":
		"Orpheus 3B Q4 — 8 voices with inline tags <laugh> <sigh> <cough>. Expressive storyteller via llama-cpp + SNAC 24kHz. 2.4GB, great value.",
	"orpheus-q8-0":
		"Orpheus 3B Q8 — premium Orpheus with fuller timbre and steadier emotion tags. 4GB download, noticeably more natural on long passages.",
	"whisper-tiny-en":
		"Whisper Tiny EN (75MB) — the instant transcriber. English-only, fastest cold start, good for short captures and live dictation on weak machines.",
	"whisper-base-en":
		"Whisper Base EN (142MB) — the balanced pick. Faster than small, accurate enough for most voices and accents.",

	"whisper-small-en":
		"Whisper Small EN (466MB) — the sweet spot. 3× base, dramatically better WER, still realtime for dictation and auto-paste.",
	"whisper-medium-en":
		"Whisper Medium EN (1.5GB) — best English accuracy before large. Handles accents, noisy rooms, and technical jargon that smaller models miss.",
	"whisper-large-v3-turbo":
		"Whisper Large-v3-Turbo (1.6GB) — OpenAI's distilled flagship, 99 languages, near-human accuracy, 4–8× faster than full Large-v3. Runs on CPU.",
	"whisper-large-v3":
		"Whisper Large-v3 (3.1GB) — the full flagship, 99 languages, best quality when you can afford the download and RAM.",
	"parakeet-v3-q8":
		"Parakeet TDT 0.6B v3 Q8 (600MB) — 25 European languages in one model, auto-detect. Great when your captures switch languages.",
	"parakeet-v3-f16":
		"Parakeet TDT 0.6B v3 FP16 (220MB) — lighter Parakeet with the same 25 languages. Pick it for tighter disks.",
	"qwen3-asr-1.7b-int4":
		"Qwen3-ASR 1.7B INT4 — 52 languages, offline, ONNX Runtime. Near-cloud accuracy without the cloud.",
	"qwen3-asr-0.6b-int4":
		"Qwen3-ASR 0.6B INT4 — 52 languages in 600MB. Best quality-per-size for multilingual teams.",
	"planner-2b":
		"Qwen3.5-2B Opus-Distilled (Free) — the default brain. Distilled from Claude Opus, strong tool-choice and self-correction for the assistant.",
	"planner-0.8b":
		"Qwen3.5-0.8B Opus-Distilled (Free) — fallback for 8GB RAM machines. Same reasoning style, lighter and quicker.",
	"planner-4b-v3":
		"Qwopus3.5-4B-v3 (Paid) — the smart planner. RL tool-calling with act-then-refine, best quality when captures need cleanup or the assistant drafts text.",
	"planner-ministral-3b":
		"Ministral-3-3B-Reasoning-2512 (Paid, Apache-2.0) — reasoning planner with native function calling and 256K context. For long transcripts and complex tool chains.",
	"planner-lfm2-2.6b-qad":
		"LFM2.5-2.6B QAD-Q4_0 (Special Offer — $13) — LiquidAI's on-device 2.6B planner with Quantization-Aware-Distillation 4-bit weights (1.59GB). 128K context, 24 languages, native tool calling + thinking tags. Strong multilingual reasoning at a tiny footprint.",
	"seed-vc":
		"Seed-VC — zero-shot voice conversion from a reference clip. Change timbre without re-generating text. GPU recommended.",
	"rvc-default":
		"RVC — classic voice packs (pre-trained). Instant conversion once the pack is installed.",
	"openvoice-v2":
		"OpenVoice V2 — tone-color conversion, zero-shot. Keep the prosody, swap the voice.",
	"neutts-air":
		"NeuTTS-Air — lightweight voice conversion air bridge. Quick timbre transfer for previews.",
	"steam-audio":
		"Steam Audio SDK (pre-installed) — binaural spatial audio, occlusion, and reflections for immersive mixes. ~10MB.",
	demucs_onnx:
		"Demucs HTDemucs ONNX (316MB, MIT) — pull vocals, drums, bass or other from any mix. Torch-free, runs on CPU.",
	"acestep-1-5":
		"ACE-Step 1.5 (10.3GB) — text-to-music generation. Describe genre, mood and tempo, get a stereo track 10s–10min. Offline, Apache-2.0/MIT weights.",
	"heartmula-3b":
		"HeartMuLa 3B (7.7GB) — melodic song generation, mono 48kHz. Tag with style-comma tags for mood, handle lyrics and duration control.",
	"stable-audio-3-small-sfx":
		"Stable Audio 3 Small SFX — one-shot sound effects from a prompt. Hits, whooshes, ambience beds.",
};

export function formatDownloads(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}k`;
	}
	return n.toString();
}

export function formatLicense(license: string): string {
	const map: Record<string, string> = {
		"apache-2.0": "Apache 2.0",
		mit: "MIT",
		"cc-by-4.0": "CC BY 4.0",
		"cc-by-sa-4.0": "CC BY-SA 4.0",
		"cc-by-nc-4.0": "CC BY-NC 4.0",
		"openrail++": "OpenRAIL++",
		openrail: "OpenRAIL",
	};
	return map[license] || license;
}

export function formatPipelineTag(tag: string): string {
	return tag
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

export function formatSize(sizeMb?: number): string {
	if (!sizeMb) {
		return "";
	}
	if (sizeMb < 1024) {
		return `${sizeMb.toFixed(1)} MB`;
	}
	return `${(sizeMb / 1024).toFixed(2)} GB`;
}
