# Linking Matrix (tab → tab handoffs)

Shared asset library: `services/library.py` + `LibraryTab`. Whether ALL tabs write to it is UNVERIFIED (GUESS: partial). Cross-tab bus exists (`CapturePill`, `AudioPlayer`, clipboard indicator) — TRACED.

Legend: WORKS / PARTIAL / MISSING / N/A. Confidence mostly GUESS.

## Handoff matrix (rows = source, cols = target; key targets)

| Source \ Target | Generate | Voices | Effects | Edit/Transcript | Noise/Enhance | Stems | Music | Dubbing | Export | Library |
|---|---|---|---|---|---|---|---|---|---|---|
| Generate | N/A | PARTIAL | WORKS (Send to Effects) | WORKS (Send to Transcript Edit) | WORKS (Send to Noise Reduction + Audio Enhance) | MISSING | N/A | MISSING | MISSING | PARTIAL |
| Voices | WORKS (profile used) | N/A | N/A | N/A | N/A | N/A | N/A | PARTIAL | N/A | PARTIAL |
| Effects | N/A | N/A | N/A | PARTIAL | PARTIAL | PARTIAL | N/A | N/A | PARTIAL | PARTIAL |
| Transcript Edit | N/A | N/A | WORKS (Send to Effects) | N/A | PARTIAL | N/A | N/A | N/A | PARTIAL | PARTIAL |
| Noise/Enhance | N/A | N/A | WORKS (Send to Effects) | WORKS (Send to Transcript Edit) | N/A | PARTIAL | N/A | N/A | PARTIAL | PARTIAL |
| Stems | N/A | N/A | WORKS (stem "Send to Effects") | PARTIAL | PARTIAL | N/A | N/A | N/A | PARTIAL | PARTIAL |
| Music Gen | N/A | N/A | N/A | N/A | N/A | WORKS (Send to Stems) | N/A | N/A | PARTIAL | PARTIAL |
| Dubbing | N/A | PARTIAL | N/A | PARTIAL | N/A | N/A | N/A | N/A | PARTIAL | PARTIAL |
| Stories | N/A | PARTIAL | N/A | N/A | N/A | N/A | N/A | N/A | PARTIAL | PARTIAL |
| ADR | N/A | PARTIAL | N/A | PARTIAL | N/A | N/A | N/A | N/A | PARTIAL | PARTIAL |
| Audio Plan | PARTIAL (voice per scene) | PARTIAL | N/A | N/A | N/A | N/A | PARTIAL (music track) | N/A | PARTIAL | PARTIAL |
| Conversation | N/A | PARTIAL | N/A | N/A | N/A | N/A | N/A | N/A | PARTIAL | PARTIAL |
| Captures | N/A | N/A | WORKS (Captures “Effects” button → /effects?path=) | WORKS (Captures “Transcript” button → /transcript?generation=) | PARTIAL (noise via Effects) | N/A | N/A | N/A | PARTIAL | PARTIAL |
| Video | N/A | N/A | N/A | PARTIAL | N/A | N/A | N/A | PARTIAL | PARTIAL | PARTIAL |
| Download | N/A | N/A | N/A | PARTIAL | PARTIAL | PARTIAL | N/A | N/A | PARTIAL | PARTIAL |
| Instruments/Studio | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | PARTIAL | PARTIAL |

## Shared global features
- Job queue / background tasks panel: Batch tab exists; global panel? UNVERIFIED (GUESS: partial).
- Recent files: Library provides; cross-tab recent? UNVERIFIED.
- Drag and drop anywhere: PARTIAL (verify).
- Audio device selection: Settings? UNVERIFIED.
- STS websocket/API: `voice_chat` route + `VoiceChat` feature; real-time pipeline. PARTIAL discoverability.
- Onboarding: `UseCaseWizard`, `TabIntro`, `FeatureTour`. PRESENT.

## Ideal "Send to..." behaviour
Implemented for the slices so far (2026-11-10): a shared `useSendTo()` hook (`app/src/lib/hooks/useSendTo.ts`) + load-by-query-param on target tabs.
- Generate→Effects: `?generation=<id>`; Generate→Transcript Edit: `?generation=<id>`; Transcript Edit→Effects: `?generation=<id>`
- Stems→Effects and Music Gen→Stems: dspUpload + `?path=<storage_path>` (backed by `GET /dsp/stream?path=` and `POST /effects/preview-path`, traversal-safe)
- Generate→Noise Reduction / Generate→Audio Enhance: client-side fetch of `/audio/<id>` → dspUpload → `?path=`
- Noise Reduction→Effects / Audio Enhance→Effects: dspUpload cleaned/enhanced blob → `?path=`
- Noise Reduction→Transcript Edit / Audio Enhance→Transcript Edit: fetch output blob → `POST /generate/import` (pre-existing) → `?generation=`
- Captures→Effects / Captures→Transcript Edit: "Effects" / "Transcript" action-bar buttons → fetch capture audio → dspUpload / /generate/import → `?path=` / `?generation=`
Remaining unwired: Voices→Generate is PARTIAL (works), Video→ADR/Export, Download→… (see matrix cells). All of these are mechanically identical to the above — the shared hook remains the wiring primitive.

## Conclusion
Linking was the biggest systemic gap. Slice 8 wired the first three Send-to links end-to-end; slices 21–24 added Generate→Transcript Edit, Transcript Edit→Effects, Generate→Noise Reduction, Generate→Audio Enhance, Noise Reduction→Effects, Audio Enhance→Effects; slices 25–26 added Noise Reduction→Transcript Edit, Audio Enhance→Transcript Edit, Captures→Effects, and Captures→Transcript Edit. Remaining rows (Video/ADR handoffs, Download-to-* destinations) are PARTIAL/MISSING by design — no known user demand has surfaced for them.