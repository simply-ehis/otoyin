# Otoyin: Workspace Completeness Audit (Agent Prompt)

Paste this as the first message to a coding agent. Phase 1 is read-only. Nothing gets changed until you say "go" for Phase 2.

## 1. Your role and goal

You are a senior product engineer auditing **Otoyin**, an all-in-one, AI-capable audio studio (Tauri + Rust backend, React frontend). The app has roughly 30 workspaces (tabs) and many models. The owner is a solo developer who cannot test everything by hand.

Your job is to answer, for **every workspace**:

1. What does this tab do, in one sentence a user would say?
2. Does it have **everything it needs** to do that job well (UX flow, backend, models, outputs)?
3. What is broken, half-built, hidden or unlinked?
4. What should the right UX and UI be, where it falls short?

The goal is a complete, honest picture and a plan. It is **not** to cut features, and **not** to rewrite things.

## 2. Ground rules (non-negotiable)

- **Phase 1 is read-only for source code.** Do not modify, move, rename or delete any source file. You may run builds, linters and tests.
- **Only write to `docs/audit/`.** No temp files, scratch scripts or logs anywhere else (not in the repo root, not in `C:/`, not in the home folder). Clean up anything you create.
- **Evidence or it didn't happen.** Every claim cites a file path and function or line. If you did not trace or run it, label it `UNVERIFIED`.
- **Use three confidence labels:** `RAN` (you executed it), `TRACED` (you followed the code end to end), `GUESS` (inference).
- **Never mark a feature "works"** unless you traced it from the button click to the backend and back to the screen, or ran it.
- **Do not invent features.** Propose additions only where the backend already supports them, or where a standard flow for that tab is clearly missing. Mark proposals as `PROPOSAL`.
- **Keep the stack:** React stays. Use npm, not bun. Do not suggest switching frameworks.
- **Finish what you start.** Process tabs in batches of 5. After each tab, write its file to disk immediately. If your context is running low, write `docs/audit/_progress.md` (done, in progress, remaining) and stop cleanly instead of rushing.
- **No commits, no pushes, no dependency installs** unless the build cannot run without them (then say so).

### Model rules (flag any violation as a bug)

- A model backend must **never load when no model is active**.
- When a model is marked cached, **only that model loads at runtime**, not all models.
- Only **small models** (for example LavaSR, DeepFilter and similar) may auto-download with the app. **Every other model goes through the marketplace.**
- Assume a low-end **8 GB RAM Windows machine** as the target. Flag any flow that loads several heavy models at once, or can spike memory.

## 3. Read first (orientation)

Before auditing any tab, map the project and write `docs/audit/00-overview.md` with:

- Repo structure in plain words (frontend, Rust backend, any Python or other services still present).
- **The workspace registry:** where tabs are defined (router, nav config, lazy imports). List every route and every nav entry.
- **The backend surface:** every Tauri command, HTTP route, websocket message and background job. Include the speech-to-speech (STS) websocket/API.
- **The model registry:** how models are declared, cached, downloaded, loaded and unloaded, and how the marketplace connects to it.
- **Shared state:** how audio files, projects, history and settings are stored and passed between tabs.
- Build, lint and test commands, and whether they pass.

## 4. Step 1: Inventory every workspace

Build a master table in `00-overview.md`, one row per workspace:

| Workspace | Route / component | In nav? | Backend commands used | Models used | Completeness (0 to 5) | One-line verdict |
| --- | --- | --- | --- | --- | --- | --- |

Completeness scale: 0 = placeholder or empty, 1 = UI shell only, 2 = partially wired, 3 = works for the happy path, 4 = complete with edge cases handled, 5 = polished.

Also list **duplicates or overlaps** (two tabs doing nearly the same job) and **orphan components** (built but never routed). Do not remove anything. Just report.

## 5. Step 2: The Job Card for each workspace

For each workspace, write `docs/audit/tabs/<workspace>.md` using this template.

### 5.1 Job

One sentence: "A user comes here to \_\_\_." Then the intended user story in 3 to 5 steps.

### 5.2 The complete-flow checklist

Mark each item `PRESENT`, `PARTIAL` or `MISSING`, with evidence:

1. **Input:** drag and drop, file picker, record, paste, or select from the project library. Supported formats and limits stated. Bad files handled.
2. **Configure:** sensible defaults so one click works, plus **presets** for common goals. Advanced options hidden until needed.
3. **Model readiness:** which model(s) it needs, whether they are installed, size, and a clear **"model not installed" state** with a one-click path to the marketplace. No silent failures.
4. **Run:** a clear primary action, a time or size estimate where possible, a progress indicator with real stages, and **Cancel** that actually stops the work and frees memory.
5. **Preview:** the result can be heard before saving, with a waveform. **Before/after (A/B)** against the original where it applies.
6. **Outputs:** each output is its own item (rename, play, solo or mute where relevant, download), plus batch export, format and quality options.
7. **Save and history:** results are kept in the project or library, and recent jobs can be reopened.
8. **Link out:** a **"Send to..."** action to the other tabs that make sense next (see Step 4).
9. **Errors and recovery:** friendly messages, retry, no lost work if the app is switched away or restarted mid-job.
10. **States:** designed empty, loading, running, done and error states.
11. **Quality of feel:** keyboard shortcuts, undo where editing, no UI freeze during processing, accessible labels, consistent with the app's design system.

### 5.3 What the tab needs vs what it has

A short table: needed capability, exists in backend (yes/no/partial, with path), exposed in UI (yes/no/partial).

### 5.4 Bugs and risks

List with severity (`BLOCKER`, `MAJOR`, `MINOR`), where, why you think so, and a repro or trace. See Step 5 for categories.

### 5.5 Gaps and the right UX

Where the tab falls short, write a mini spec (see Step 6).

### Worked example (illustration only, not a rule): Stem separation

The owner's picture of a complete tab:

1. **Drop audio** onto a large, friendly drop zone. Show file name, length and a waveform at once.
2. **Choose a preset:** for example Vocals + Instrumental, 4 stems (vocals, drums, bass, other), more stems if a model supports it, Karaoke (no vocals), Acapella. Each preset names the model, size and rough time. If the model isn't installed, say so with a button.
3. **Run** with a progress bar and Cancel.
4. **Results:** one row per stem with its own waveform, play, **solo and mute**, volume, and an **"isolated instrument" preview** so the user hears exactly the cut-out part, plus a mixed preview with everything. A/B against the original.
5. **Export** one stem, selected stems or all (zip), with format choice.
6. **Send to** Effects, Noise Reduction, Edit or Spatial.

Use this level of completeness as the bar, but fit it to what each tab actually does.

### Minimum complete flow per feature (compare against, adapt, don't blindly impose)

- **Dubbing:** import video or audio, then transcribe, translate, review segments (text, speaker, timing), pick a voice per speaker, generate, fit timing, mix with preserved background, export audio or video.
- **Effects:** an effect chain (add, reorder, bypass), presets, wet/dry, fast preview, before/after, apply to a selection, export.
- **Generate (text to speech):** text box, voice picker with a preview, speed and style controls if supported, long-text chunking, history, download.
- **Voice clone:** record or upload samples with a quality check (length, noise), a **consent confirmation**, create a voice profile, a test phrase, save to a voice library that Generate and Dubbing can use.
- **Convert:** check which kinds exist (file format and sample-rate conversion, voice conversion). Each needs its own clear flow. Batch support is expected for format conversion.
- **Polish:** one-click enhance (noise, EQ, loudness, de-essing as available) with a strength control and before/after.
- **Reduce noise:** input, mode (AI or profile-based), strength, spectrogram or waveform, before/after, export.
- **Edit:** a waveform editor with selection, cut/copy/paste, fades, normalize, zoom, markers, undo/redo, non-destructive edits, keyboard shortcuts, export.
- **Music generation:** prompt plus genre, BPM or duration controls, seed, multiple variations, preview, extend, and a path to stem separation.
- **SFX generation and browsing:** generate from a prompt, and a browsable library with search, tags, preview and favorites, with the source and license shown.
- **Songwriting:** a lyrics editor with sections, rhyme and line help, AI suggestions, and a path to send lyrics to music generation or text to speech.
- **AI co-author / in-app agent:** it can describe what it will do, then actually call the other tabs' capabilities. Verify what tools it can use and which tabs it cannot reach.
- **Marketplace:** browse, search, filter, size and hardware requirements, license, install and uninstall with progress, updates, installed state shown everywhere, and checkout if paid items exist.
- **Community:** check whether it is real or a stub. If a stub, say what is missing in one paragraph.
- **Spatial audio:** place sources on a stage (2D or 3D), binaural preview, distance and reverb, export formats. Check what the backend already supports.

## 6. Step 3: Hidden features and orphans (backend to UI)

Write `docs/audit/backend-orphans.md`.

1. List **every** backend capability: Tauri commands, routes, websocket messages, model capabilities, background jobs, and any feature flags.
2. Match each to a UI entry point. Produce three lists:
   - **Hidden features:** backend exists, no UI (for example an audio capability with no tab, such as spatial editing).
   - **Ghost UI:** UI exists, backend missing, broken or stubbed.
   - **Dead code:** neither reachable nor used.
3. For each hidden feature, say what UI it needs: a new tab, a panel inside an existing tab, or a "Send to" target. Do not decide what to cut.

## 7. Step 4: Linking the tabs together

Write `docs/audit/linking-matrix.md`.

- Check whether there is **one shared asset library or project** that every tab reads from and writes to. If not, describe how files move between tabs today.
- Build a matrix, **from tab to tab**, of the handoffs that make sense. Examples: stems to effects, noise reduction to edit, generate to dubbing, music generation to stems, songwriting to music generation, clone to generate and dubbing.
- Mark each cell `WORKS`, `PARTIAL`, `MISSING` or `N/A`.
- Describe the ideal "Send to..." behaviour: carries the file, keeps the source name and history, opens the target tab with the file loaded, and can go back.
- Check shared global features: job queue or background tasks panel, recent files, drag and drop anywhere, audio device selection, the STS websocket/API, and onboarding.

## 8. Step 5: Bug hunt

Write `docs/audit/bugs.md`. Trace each tab's main flow end to end, and run the build, linter and test suite. Look especially for:

- State lost when switching tabs or restarting.
- Model load and unload mistakes (breaking the model rules above), models staying in memory, memory spikes.
- Windows path and file-lock problems, long paths, non-ASCII filenames, spaces.
- Large files (an hour of audio), mismatched sample rates and channel counts, mono or stereo assumptions.
- Cancel that doesn't cancel, jobs that hang, progress that lies.
- Websocket or API reconnect, timeouts, races between concurrent jobs.
- Frozen UI during heavy work, missing loading or error states, unhandled promise rejections.
- Broken links between tabs, missing translations, accessibility gaps.
- Settings that do nothing.

For each bug: ID, severity, tab, symptom, probable root cause with evidence, repro steps, and a suggested fix. Sort by severity.

## 9. Step 6: UX and UI specs for the gaps

For any tab scoring 3 or lower, or any hidden feature that needs a tab, write `docs/audit/specs/<tab>.md`:

- Goal and user story.
- A simple layout sketch in text (regions and what lives in each).
- Every state: empty, loading, running, done, error.
- Components and controls, with default values and presets.
- Copy: button labels and messages in plain language.
- Backend calls it needs (existing or new).
- Acceptance criteria that a person could check in two minutes.

Stay inside the app's current design system. If it has none that you can find, say so and list what you used instead.

## 10. Provenance flags (neutral, no action)

While reading, if a file or function looks copied from a third-party project (license headers, unrelated comments, odd naming, vendored code), list it in `docs/audit/provenance.md` with the path and why you think so. Do not judge it, remove it or change it. This is for the owner's records.

## 11. Output and finish line

Your deliverables, all under `docs/audit/`:

- `00-overview.md` (project map, master table, top 10 findings)
- `tabs/<workspace>.md` (one per workspace)
- `backend-orphans.md`
- `linking-matrix.md`` `
- `bugs.md`
- `specs/<tab>.md` (as needed)
- `provenance.md`
- `roadmap.md`: the work in suggested order, in small slices of one tab each, each with a definition of done
- `_progress.md` (only if you had to stop early)

Before you say you are finished, check yourself:

- Did every workspace in the registry get a Job Card?
- Does every claim have a path and a confidence label?
- Did you write anything outside `docs/audit/`? (It should be nothing.)
- Did you modify any source file? (It should be no.)

Then give a short summary: how many tabs audited, the five most valuable findings, the five worst bugs, and the hidden features worth surfacing first.

## 12. Phase 2 (only after the owner says "go")

Work one slice at a time, taken from `roadmap.md`:

1. One tab (or one linking fix) per slice. Write down what you will change before changing it.
2. Implement completely. No half-finished UI, no stubs presented as done.
3. Run the build, linter and relevant tests. Report results honestly, including failures.
4. Show the new states (empty, running, done, error) with screenshots or a short written walkthrough.
5. Stop and report after each slice. Do not start the next one without a go-ahead.

If the same fix fails twice, stop, explain what you learned, and propose a different approach instead of patching again.
