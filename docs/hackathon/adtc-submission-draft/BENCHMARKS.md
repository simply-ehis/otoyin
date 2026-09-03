# ADTC benchmark evidence

Status: **not submission-valid yet**. No profiler result is being presented as a score.

## Required evidence

Run the official profiler on the standard Ubuntu laptop profile described by ADTC, after downloading the exact model named in `metadata.json`:

```bash
adtc-profiler run \
  --submission . \
  --mode participant \
  --output submission.json
```

Record the profiler version, OS, CPU, RAM, model checksum, peak/steady RSS, prompt-processing rate, generation rate, first-token latency, accuracy result, and thermal observations. Preserve the raw JSON if the organizers permit it.

## Evidence rules

1. Do not mix development-machine measurements with standard-laptop claims.
2. Do not report a smoke run with shortened prompts/repetitions as the official throughput result.
3. Do not report empty accuracy as a passing accuracy result.
4. Keep the exact model filename, public URL, quantization, and report values synchronized.
5. Treat an out-of-memory, crash, or thermal-throttling result as a release blocker.

## Preparation note

The local repository contains a CPU-only `llama-server.exe` and the exact GGUF file, but the desktop environment used for preparation exposed a Vulkan `llama-bench.exe` first. That path attempted to allocate approximately 959 MB on the integrated GPU and failed. A bounded CPU smoke run was not allowed to complete by the desktop command window. This note is diagnostic evidence only; the final submission needs a complete official profiler run on the target Ubuntu laptop.
