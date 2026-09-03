# Africa Deep Tech Challenge 2026

## Otoyin / 21labs submission pack

**Prepared:** 25 August 2026  
**Recommended challenge domain:** `autonomous_ai_agents`  
**Submission status:** Draft — no submission sent. The package is being prepared for organizer reopening or the next ADTF round.

> **Timing note:** the live Devpost page currently says that this hackathon has ended. Do not submit from this draft. Keep the package ready for an organizer reopening, a correction window, or the next ADTF challenge, and re-check the official rules before publishing.

## 1. Readiness rating

| Area | Rating | Assessment |
|---|---:|---|
| Product concept | 8/10 | Otoyin has a clear offline creator-workstation story with a real in-app agent and external MCP surface. |
| On-device agent fit | 8/10 | The assistant is designed around local GGUF planners, `llama.cpp`, structured tool routing, and shared workflow skills. |
| ADTC packaging | 6/10 | A clean template-shaped draft, model downloader, report, and reproducibility notes are now prepared; public fork and owner fields remain. |
| Benchmark evidence | 3/10 | The exact GGUF is present locally and the CPU-only runtime path is identified, but no submission-valid profiler JSON is attached. |
| Devpost readiness | 4/10 | The narrative is ready, but identity, public URLs, licenses, evidence, and eligibility still need confirmation. |

**Overall ADTC submission readiness: 6/10.** The product and story are credible; owner verification and official measurement are the two release gates. It is not a 10/10 submission until those gates produce evidence.

### The 10/10 gate

| Scoring concern | Evidence required | Current state |
|---|---|---|
| Accuracy (50%) | Official profiler accuracy output for the two prompts plus hidden-prompt robustness | Pending; never replace with a hand-picked demo answer. |
| Throughput (30%) | Official `submission.json` on the standard laptop profile | Pending; the development machine has a Vulkan-memory limitation and is not the target environment. |
| Efficiency (20%) | Peak and steady RSS below the 7 GB ceiling | Pending official run; model file is 1,270,804,416 bytes locally. |
| African Use Case Bonus | One concrete local deployment context, verified user/partner evidence, and tested language/workflow claim | Intentionally false until you provide evidence. |
| Thermal penalty | Temperature/throttling evidence from the official run | Pending; no claim made. |

The clean handoff folder is deliberately honest: it contains no invented benchmark numbers and no fake local-use evidence.

## 2. Owner-only fields to complete

Replace every bracketed value before submission. These cannot be safely inferred:

- `[TEAM ID]` — the unique ID registered on the ADTF portal.
- `[SUBMITTER NAME]`, `[SUBMITTER EMAIL]`, `[GITHUB HANDLE]`.
- `[COUNTRY]` and eligibility confirmation for every team member.
- `[PUBLIC PRODUCT REPOSITORY URL]` and `[PUBLIC ADTC SUBMISSION REPOSITORY URL]`.
- `[DEMO VIDEO URL]` and the final screenshots or short clips.
- `[MODEL PUBLIC URL]`, exact GGUF filename, and model-card license.
- `[MEASURED HARDWARE]`, peak RSS, time to first token, generation tokens/second, and thermal result from the ADTC profiler.
- `[TARGET LOCAL CONTEXT]` and `[LANGUAGE]` if claiming the African Use Case Bonus.

## 3. Devpost form — copy-ready draft

### Project title

**Otoyin: An Offline Audio-Production Agent for Budget Laptops**

### Tagline

**Local AI that plans, cleans, mixes, and exports voice content without cloud access.**

### Challenge domain

**Autonomous AI Agents** (`autonomous_ai_agents`)

### Short description

Otoyin is an offline voice and audio workstation whose local AI agent turns plain-language production requests into safe, repeatable audio workflows. It can plan voiceover, podcast, audiobook, ADR, cleanup, mixing, and export tasks, then call local audio tools through the same skill catalog exposed to both the in-app assistant and the 21labs MCP interface. The goal is practical creative autonomy on the hardware many African creators actually have: a normal laptop, intermittent connectivity, limited RAM, and no dependable cloud budget.

### Full project description

Audio production software is powerful but fragmented. A creator may need transcription, voice generation, noise reduction, loudness control, music or effects, routing, and export — often across several applications and with an internet connection assumed at every step. That assumption excludes creators working with unreliable connectivity, expensive data, privacy-sensitive recordings, or modest hardware.

Otoyin is a local-first audio workstation built around that constraint. The user describes the outcome in natural language — for example, “clean this interview, duck the music under the speech, and export a podcast master” — and the on-device assistant converts the request into a structured plan. It selects the relevant workflow skill, asks only for missing information, executes reversible operations, and reports what changed. The same capability is available inside the app and through an MCP interface, so a local agent can drive the studio without a cloud API.

The agent uses a GGUF planner through `llama.cpp`, a shared manifest for assistant/MCP instructions, confidence-aware tool routing, and a local catalog of audio operations. Otoyin includes loading and progress states so model startup and long-running audio work are visible instead of becoming silent waits. All core processing is designed to run on-device; the network is used only for an explicit model download or optional user-controlled integrations, never for inference.

For ADTC, we will package the selected planner as a public GGUF download with the official template, exactly two domain prompts, and profiler measurements on the standard laptop profile. The submission will report measured RAM, latency, throughput, and thermals rather than estimated performance.

### What we built

- Offline desktop audio workstation for voice, dialogue, music, sound effects, cleanup, mixing, mastering, and export.
- Local LLM assistant that plans multi-step production tasks.
- Shared agent skill catalog used by both the in-app assistant and the 21labs MCP server.
- Safe tool routing with structured plans and lower-risk UI control boundaries.
- Local model lifecycle and RAM-aware context budgeting for smaller machines.
- Visible loading, pending, and progress states for route changes, model work, and audio operations.
- Reversible editing expectations so generated or processed material remains recoverable.

### Why this is an autonomous-agent submission

This is not only an audio editor with a chat box. The local agent follows an observable loop: interpret intent → select the relevant skill → ask for missing constraints → produce an ordered plan → call bounded tools → report measurements and export results. The shared skill catalog is the bridge between the desktop assistant and the 21labs MCP surface. The application provides the tools; ADTC should score the selected local model separately through the official prompts and profiler.

### Judge objection check

- **“This is a cloud wrapper.”** Core inference and audio processing are local; cloud access is not required after the explicit model download.
- **“This is just an audio app.”** The evaluated contribution is the planner’s ability to turn production intent into safe, ordered tool workflows, not the existence of a waveform editor.
- **“The African claim is generic.”** The draft keeps `african_alpha_claim` false until you provide a specific context and test evidence.
- **“The numbers are marketing.”** The package leaves every unmeasured performance field blank and names the official profiler as the source of truth.

### Why this is an African deep-tech use case

The intended users are independent creators, community-radio producers, educators, journalists, and small media teams who need reliable voice production without sending recordings or prompts to a remote service. Otoyin treats connectivity, privacy, power, and RAM as product requirements instead of afterthoughts.

To claim the official African Use Case Bonus, add one concrete local deployment context, one verified user or partner statement, and a tested language or workflow claim. Until that evidence is attached, keep `african_alpha_claim` set to `false`.

### Built with

`llama.cpp`, GGUF, local Python services, FastAPI, React, TypeScript, Tauri, local audio engines, shared assistant/MCP tool schemas, and offline model lifecycle controls.

### Links

- Product repository: `[PUBLIC PRODUCT REPOSITORY URL]`
- ADTC template submission repository: `[PUBLIC ADTC SUBMISSION REPOSITORY URL]`
- Demo video: `[DEMO VIDEO URL]`
- Technical report: `REPORT.md` in the ADTC submission repository

### Team

`[TEAM NAME]` — `[SUBMITTER NAME]` and `[OTHER TEAM MEMBERS, IF ANY]`  
Country of residence: `[COUNTRY]`  
Contact: `[SUBMITTER EMAIL]`

## 4. Official-template files

The ADTC entry should be a public fork of the official template, not just a link to the main Otoyin product repository. The submission repository needs these root files:

```text
your-adtc-submission/
├── metadata.json
├── download_model.sh
├── REPORT.md
├── .gitignore
└── model/
    └── selected-model.gguf   # downloaded by the script; never committed
```

The product repository and the ADTC submission repository can be separate. Link both from Devpost so judges can see the working application and the reproducible model package.

### `metadata.json` draft

Use this as the content to place into the official template. The model filename and public URL must match exactly.

```json
{
  "team_id": "[TEAM ID]",
  "domain": "autonomous_ai_agents",
  "language_scope": ["en"],
  "african_alpha_claim": false,
  "budget_laptop_claim": true,
  "submitter": {
    "name": "[SUBMITTER NAME]",
    "email": "[SUBMITTER EMAIL]",
    "github_handle": "[GITHUB HANDLE]"
  },
  "cross_disciplinary_pairing": {
    "discipline": "audio production",
    "load_bearing": true,
    "description": "The planner is evaluated on its ability to turn real audio-production requests into ordered, safe, tool-ready workflows for voice creators and small media teams."
  },
  "test_prompts": [
    {
      "prompt_id": "tp_001",
      "prompt": "Create a production plan for a 30-second community-radio announcement about safe water in [TARGET COUNTRY OR REGION]. Return the audience, a concise voiceover script, recording guidance, and an ordered post-production plan. State assumptions and avoid inventing local facts."
    },
    {
      "prompt_id": "tp_002",
      "prompt": "A creator has one interview recording, one music bed, and a 45-second intro. Produce an ordered, tool-ready plan to clean the speech, remove long silences without damaging words, duck the music under speech, normalize the finished mix, and export a shareable podcast file. State what must be confirmed before execution."
    }
  ],
  "model": {
    "name": "Qwen3.5-2B.Q4_K_M",
    "runtime": "llama.cpp",
    "quantization": "GGUF Q4_K_M",
    "parameters_estimate": "2B",
    "packaging": "binary_bundle"
  },
  "_runtime": {
    "model_path": "model/Qwen3.5-2B.Q4_K_M.gguf"
  }
}
```

The current app configuration points to the public `Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF` repository and its `Qwen3.5-2B.Q4_K_M.gguf` file. If the selected model is changed after profiling, update the model name, quantization, file path, download URL, and report together.

### `download_model.sh` requirements

Use the official template script and replace only the model filename and public URL. Verify that it:

1. Creates `model/` relative to the script location.
2. Is safe to run repeatedly without downloading a complete model again.
3. Downloads without credentials.
4. Writes the exact path declared in `metadata.json`.
5. Uses a temporary partial file and moves it into place only after a successful download.
6. Leaves `model/` and `*.gguf` ignored by Git.

### Local verification note

The selected file is present locally at `model/Qwen3.5-2B.Q4_K_M.gguf` and is 1,270,804,416 bytes. The repository also includes a CPU-only `llama-server.exe` runtime. The official profiler was installed and reached its throughput stage, but the bundled Vulkan-only benchmark launcher attempted an integrated-GPU allocation and failed; a subsequent CPU benchmark smoke run exceeded the desktop command window before producing a submission JSON. This is an environment limitation, not a claim of passing performance. Run the official profiler on the standard Ubuntu laptop profile before publishing any result.

## 5. `REPORT.md` — copy-ready technical report

### Technical Report — Otoyin: An Offline Audio-Production Agent for Budget Laptops

**Team ID:** `[TEAM ID]`  
**Domain:** `autonomous_ai_agents`  
**Model:** `Qwen3.5-2B.Q4_K_M`  
**Runtime:** `llama.cpp`  
**Repository:** `[PUBLIC ADTC SUBMISSION REPOSITORY URL]`

### Problem

Independent creators and small media teams need to turn speech recordings into usable voice content, but the workflow is normally split across transcription, generation, cleanup, mixing, mastering, and export tools. Cloud-first assistants add recurring cost, require stable connectivity, and create privacy concerns for interviews, journalism, education, and community media.

Otoyin addresses this with a local audio workstation and an on-device agent. A user can describe the desired result in plain language; the planner converts that request into an ordered workflow, selects the relevant audio-production skill, and exposes the next actions clearly. The design target is a creator using an ordinary laptop with limited RAM and no guaranteed internet connection.

### Design decisions

- **Base model:** `Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled` — selected as the default local planner because the app needs structured reasoning over multi-step production tasks, not only short chat answers.
- **Quantization:** `Q4_K_M` — selected as the starting balance between reasoning quality, model memory, and CPU feasibility. The final claim must be supported by the profiler output attached to this submission.
- **Runtime:** `llama.cpp` with GGUF weights — required by the challenge and appropriate for CPU-first local inference.
- **Tool routing:** the app uses a shared agent manifest and structured tool schemas so the in-app assistant and MCP surface describe the same capabilities.
- **Safety:** tool execution is explicit and reversible where the underlying operation supports it; the assistant reports assumptions and errors instead of silently applying an unsafe workflow.

### Alternatives considered

- A larger planner may improve reasoning but reduces headroom on an 8 GB machine and increases cold-start and thermal risk.
- A smaller fallback planner reduces memory pressure but may be less reliable on long, multi-step workflows.
- A cloud LLM would simplify capability expansion but violates the offline requirement and weakens privacy and availability for the target users.
- Directly exposing every tool to every prompt increases context size and routing noise; the shared catalog and relevant-skill selection keep the planner input focused.

### Constraints

- Standard challenge profile: 8 GB RAM target, integrated graphics, CPU inference, Ubuntu 22.04 LTS.
- The official challenge treats 7 GB as the memory ceiling during evaluation; an out-of-memory or crash result is disqualifying.
- Inference must be fully offline after the model download step.
- The application must remain understandable while the local model is loading or an audio operation is running, so loading and progress states are part of the product design.
- Recordings may be private or connectivity may be unreliable, so audio and prompts should not need to leave the device.

### Benchmarks

Populate this table from the official profiler. Do not use estimates from a different machine as the final values.

| Metric | Measured value |
|---|---|
| Machine | `[MEASURED HARDWARE]` |
| Operating system | `[OS VERSION]` |
| CPU / cores | `[CPU]` |
| RAM | `[TOTAL RAM]` |
| Model file size | `[GGUF SIZE]` |
| Peak RSS | `[PEAK RSS MB]` |
| Steady-state RSS | `[STEADY RSS MB]` |
| Time to first token | `[TTFT MS]` |
| Generation speed | `[TOKENS/SECOND]` |
| Prompt processing speed | `[PROMPT TOKENS/SECOND]` |
| Thermal throttling | `[NONE / DETAILS]` |
| Peak CPU temperature | `[TEMPERATURE OR NOT AVAILABLE]` |
| Profiler output | `[LINK OR COMMITTED submission.json]` |

The ADTC score is driven by accuracy, throughput, memory efficiency, and thermal stability. The report should make clear which values are self-measured and which are official evaluation results.

For the exact run instructions and evidence policy, see `adtc-submission-draft/BENCHMARKS.md`. A smoke test may help diagnose the environment, but only the standard official profiler run belongs in the final benchmark table.

### Reproduction

```text
git clone [PUBLIC ADTC SUBMISSION REPOSITORY URL]
cd [SUBMISSION DIRECTORY]
bash download_model.sh
adtc-profiler run --submission . --mode participant --output submission.json
```

The final submission must also be tested with no network access after the model is downloaded. Confirm that the application and model do not make outbound requests during inference.

### Open-source and model attribution

- Otoyin / 21labs: `[LICENSE AND REPOSITORY LINK]`
- `llama.cpp`: `[EXACT VERSION AND LICENSE LINK]`
- Selected GGUF model: `[MODEL CARD URL]`
- Audio libraries and bundled engines: `[LIST LICENSES USED IN THE SUBMISSION]`

Do not rely on a model name alone. Attach the exact model-card URL and confirm that redistribution of the public GGUF is permitted.

## 6. Two-minute demo script

### 0:00–0:12 — The problem

“Audio production is still fragmented and often cloud-dependent. Otoyin is a local-first studio for creators who need to work with the laptop and connectivity they already have.”

Show the Otoyin logo, the offline/local model indicator, and the empty or starter workspace.

### 0:12–0:32 — The request

Type: “Clean this interview, duck the music under the speech, master it for a podcast, and export it.”

Show the assistant interpreting the request, selecting the audio-production skill, and stating the planned steps and assumptions.

### 0:32–0:58 — The local agent

Show the local model status and tool plan. Say: “The planner runs through llama.cpp on the device. The request, reasoning, and audio stay local after model download.”

### 0:58–1:25 — Execution

Show the workflow applying cleanup, ducking, loudness, and export. Include a progress state and one before/after waveform or level view. Keep the demo focused on the end-to-end result, not menus.

### 1:25–1:45 — Shared skills

Show the same skill or capability listed in the in-app assistant and the MCP surface. Say: “The skill catalog is shared, so both the desktop assistant and an external local MCP client can use the same documented workflows.”

### 1:45–2:00 — Why it matters

“Otoyin makes practical audio AI available without a cloud bill, without sending private recordings away, and without assuming a workstation-class GPU. We are building local creative infrastructure for the hardware creators actually have.”

End on the public repository URL and the short benchmark panel.

## 7. Final submission gate

Do not press Submit until every item below is true:

- [ ] Devpost is open for the relevant round, or the organizer has confirmed a reopening/correction window.
- [ ] Eligibility is confirmed: African residence, adult status, team size, early-stage status, funding cap, and original work.
- [ ] Official ADTC template is forked and public.
- [ ] `metadata.json` contains no placeholder values and exactly two prompts.
- [ ] Domain is consistent across Devpost, `metadata.json`, and `REPORT.md`.
- [ ] The selected model is a public GGUF and runs with `llama.cpp`.
- [ ] `download_model.sh` succeeds from a clean clone and is idempotent.
- [ ] `model/` and `*.gguf` are ignored and no weights are committed.
- [ ] Profiler smoke test succeeds; final profiler output is attached or committed as allowed.
- [ ] Peak memory is below the official ceiling; no crash, OOM, or thermal throttling.
- [ ] The two prompts are domain-specific and do not overfit to a single canned answer.
- [ ] Model, runtime, quantization, license, and download URL are all consistent.
- [ ] Product repository, submission repository, screenshots, and two-minute video are public and tested in a private browser window.
- [ ] African Use Case Bonus is either evidenced or left false.
- [ ] No submission has been sent from this draft without an explicit owner decision.

## 8. Official sources

- Devpost challenge overview: <https://adtc-2026.devpost.com/>
- Devpost rules: <https://adtc-2026.devpost.com/rules>
- ADTF challenge brief and scoring: <https://africadeeptech.org/challenge-2026/>
- Official submission template: <https://github.com/Africa-Deep-Tech-Foundation/adtc-2026-submission-template>
- Official profiler: <https://github.com/Africa-Deep-Tech-Foundation/adtc-profiler>
