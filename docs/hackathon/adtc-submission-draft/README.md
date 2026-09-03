# Otoyin ADTC submission draft

This folder is the submission-shaped handoff for Otoyin / 21labs. It is not a submitted entry and contains no model weights in Git. Replace every bracketed owner field before publishing or reusing it for a later ADTF round.

## Clean-clone workflow

```bash
git clone <PUBLIC_ADTC_SUBMISSION_REPOSITORY_URL>
cd <SUBMISSION_DIRECTORY>
bash download_model.sh
adtc-profiler run --submission . --mode participant --output submission.json
```

The download step is the only expected network step. After it completes, disconnect the network and verify that the local model/runtime can run without outbound access. Keep `submission.json` out of Git unless the organizers explicitly request it.

## Model identity

- Model: `Qwen3.5-2B.Q4_K_M`
- Runtime: `llama.cpp`
- File: `model/Qwen3.5-2B.Q4_K_M.gguf`
- Public model repository: <https://huggingface.co/Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF>
- Local file size observed during preparation: `1,270,804,416` bytes

Confirm the model-card license, final URL, checksum, and exact profiler output before publishing.

## Prompt policy

The two prompts in `metadata.json` are the complete evaluation set for this draft. Do not add prompts that expose private chain-of-thought, require cloud services, or depend on facts the model cannot verify. The application demo is separate from the model benchmark.

## Evidence policy

`REPORT.md` intentionally leaves unmeasured values blank. Do not fill throughput, latency, RAM, temperature, or accuracy from estimates. Use `BENCHMARKS.md` to record the machine, command, profiler version, and any failure mode before claiming readiness.
