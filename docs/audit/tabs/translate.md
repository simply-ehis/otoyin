# Translate

Route: `/translate` → `app/src/features/translate/TranslateView.tsx`. In nav: yes (Voice & Transcription group).

## Job
A user comes here to translate text (and possibly audio) using offline packs.

## Complete-flow checklist
1. Input: text/audio. PARTIAL.
2. Configure: source/target language, packs. PARTIAL.
3. Model readiness: translation packs (marketplace). PARTIAL.
4. Run: translate. UNVERIFIED.
5. Preview: n/a (text). 
6. Outputs: translated text. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Generate (TTS). GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Translation | yes (`services/translation.py`, `routes/translate.py`) | yes (TranslateView) |

## Bugs/risks
- MINOR: pack install state. GUESS.

## Gaps & right UX
- Add send-to Generate. PROPOSAL.
Confidence: GUESS.