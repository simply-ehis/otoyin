# Technical Report — Otoyin: An Offline Audio-Production Agent for Budget Laptops

**Team ID:** `[TEAM ID]`  
**Domain:** `autonomous_ai_agents`  
**Model:** `Qwen3.5-2B.Q4_K_M`  
**Runtime:** `llama.cpp`  
**Product repository:** `[PUBLIC PRODUCT REPOSITORY URL]`

**Evidence status:** Draft only. No submission has been sent, and no performance value below is claimed until it comes from a complete official profiler run on the target laptop profile.

## Problem

Independent creators and small media teams need to turn speech recordings into usable voice content, but the workflow is normally split across transcription, generation, cleanup, mixing, mastering, and export tools. Cloud-first assistants add recurring cost, require stable connectivity, and create privacy concerns for interviews, journalism, education, and community media.

Otoyin addresses this with a local audio workstation and an on-device agent. A user describes the desired result in plain language; the planner converts that request into an ordered workflow, selects the relevant audio-production skill, and exposes the next actions clearly. The design target is a creator using an ordinary laptop with limited RAM and no guaranteed internet connection.

## Design Decisions

- **Base model:** `Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled` from the public Jackrong GGUF repository.
- **Quantization:** `Q4_K_M`, selected as the starting balance between reasoning quality, model memory, and CPU feasibility.
- **Runtime:** `llama.cpp` with GGUF weights, as required by the challenge and appropriate for CPU-first local inference.
- **Tool routing:** a shared agent manifest and structured tool schemas keep the in-app assistant and MCP surface aligned.
- **Safety:** tool execution is explicit and reversible where the underlying operation supports it; the assistant reports assumptions and errors instead of silently applying an unsafe workflow.

## Alternatives Considered

- A larger planner may improve reasoning but reduces headroom on an 8 GB machine and increases cold-start and thermal risk.
- A smaller fallback planner reduces memory pressure but may be less reliable on long, multi-step workflows.
- A cloud LLM would simplify capability expansion but violates the offline requirement and weakens privacy and availability for the target users.
- Directly exposing every tool to every prompt increases context size and routing noise; relevant-skill selection keeps the planner input focused.

## Constraints

- Standard challenge profile: 8 GB RAM target, integrated graphics, CPU inference, Ubuntu 22.04 LTS.
- The official challenge treats 7 GB as the memory ceiling during evaluation; an out-of-memory or crash result is disqualifying.
- Inference must be fully offline after the model download step.
- Loading and progress states are part of the product design so local model startup and audio work are visible.
- Recordings may be private or connectivity may be unreliable, so audio and prompts should not need to leave the device.

## Benchmarks

Populate from the official profiler. Do not use estimates from another machine. The exact model file observed during preparation was `1,270,804,416` bytes; this is a file-integrity fact, not a performance result.

| Metric | Measured value |
|---|---|
| Machine | `[MEASURED HARDWARE]` |
| Operating system | `[OS VERSION]` |
| CPU / cores | `[CPU]` |
| RAM | `[TOTAL RAM]` |
| Model file size | `1.27 GB (repository listing; verify downloaded file)` |
| Peak RSS | `[PEAK RSS MB]` |
| Steady-state RSS | `[STEADY RSS MB]` |
| Time to first token | `[TTFT MS]` |
| Generation speed | `[TOKENS/SECOND]` |
| Prompt processing speed | `[PROMPT TOKENS/SECOND]` |
| Thermal throttling | `[NONE / DETAILS]` |
| Peak CPU temperature | `[TEMPERATURE OR NOT AVAILABLE]` |
| Profiler output | `[LINK OR COMMITTED submission.json]` |

These are self-measured development benchmarks. Official scores are measured by the ADTC profiler on the standard evaluation machine.

### Current preparation evidence

- The exact GGUF file is present locally at `model/Qwen3.5-2B.Q4_K_M.gguf`.
- The repository includes a CPU-only `llama-server.exe` runtime and CPU backend libraries.
- The first local profiler attempt selected the Vulkan benchmark launcher and failed while allocating approximately 959 MB on the integrated GPU.
- A bounded CPU smoke run did not complete within the desktop command window, so no smoke number is promoted into this report.

These observations explain why the table is intentionally unfilled. They do not establish a pass or a score. Run the official profiler on the standard Ubuntu laptop profile before publishing.

## Reproduction

```text
git clone [PUBLIC ADTC SUBMISSION REPOSITORY URL]
cd [SUBMISSION DIRECTORY]
bash download_model.sh
adtc-profiler run --submission . --mode participant --output submission.json
```

After the download step, test with networking disabled and confirm that inference makes no outbound requests.

## Attribution

- Otoyin / 21labs: `[LICENSE AND REPOSITORY LINK]`
- `llama.cpp`: `[EXACT VERSION AND LICENSE LINK]`
- Selected GGUF model: <https://huggingface.co/Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF>
- Model license: Apache-2.0 as listed by the model repository; verify the model card before submission.
- Audio libraries and bundled engines: `[LIST LICENSES USED IN THE SUBMISSION]`

## Evaluation boundaries

The application supplies local audio tools and the shared skill catalog; the model evidence must still be reproducible independently through `metadata.json`, `download_model.sh`, and the official profiler. The demo should show the agent’s intent-to-plan-to-tool loop, while the report must keep model accuracy, throughput, memory, and thermals separate from claims about the surrounding application.
