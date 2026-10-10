# Button Reference — Complete UI Action Catalog

> **PURPOSE:** Every button, dropdown, and control across all otoyin tabs with exact actions.
> **OWNS:** Complete UI interaction reference
> **READ-WHEN:** Adding new buttons, debugging UI, auditing features
> **KEY-FILES:** All `app/src/features/**/*.tsx` + shared UI primitives in `app/src/components/ui/`
> **INVARIANTS:** Organized by tab; each entry has label, action, condition
> **GOTCHAS:** Some buttons are conditional (persona only if profile has personality)
> **UPDATED:** 2026-10-09

## Sidebar (Global Navigation)

| Button | Route | Action |
|---|---|---|
| Logo | — | Toggle sidebar open/collapsed |
| Generate | `/` | Navigate to Generate page |
| Workspace | `/workspace` | Navigate to Workspace page |
| Audio Studio | `/audio-studio` | Navigate to Audio Studio page |
| Stories | `/stories` | Navigate to Stories page |
| Sounds | `/sounds` | Navigate to Sounds page |
| Projects | `/projects` | Navigate to Projects page |
| Captures | `/captures` | Navigate to Captures page |
| Presets | `/community-presets` | Navigate to Community Presets page |
| Voices | `/voices` | Navigate to Voices page |
| Effects | `/effects` | Navigate to Effects page |
| Models | `/models` | Navigate to Models page |
| Settings | `/settings` | Navigate to Settings page |
| Minimize | — | Minimize window (non-macOS) |
| Maximize | — | Toggle maximize window (non-macOS) |

---

## Generate Tab

### Primary Actions

| Button | Icon | Action | Condition |
|---|---|---|---|
| Generate | Sparkles | Submit generation | Profile selected, not pending |
| Compose | Dice | Auto-generate text from personality | Profile has personality |
| Persona | Wand2 | Toggle personality mode | Profile has personality |
| Instruct | SlidersHorizontal | Toggle instruct panel | Expanded + engine supports |

### Dropdowns

| Dropdown | Purpose |
|---|---|
| Voice | Select voice profile |
| Language | Select generation language |
| Emotion | Select emotion DSP preset |
| Engine/Model | Select TTS engine and model |
| Effects Preset | Select effects chain |
| Temperature | Toggle auto vs manual |

### History Panel

| Button | Action | Condition |
|---|---|---|
| Clear failed | Remove all failed generations | Failed exist |
| Star | Toggle favorite | Completed |
| AudioLines | Toggle version list | Multiple takes |
| RotateCcw | Retry generation | Failed |
| Trash2 | Delete generation | Failed |
| Square | Cancel generation | In-progress |

### History More Actions (per generation)

| Action | Description |
|---|---|
| Download audio | Download audio file |
| Export package | Export generation + metadata |
| Retry | Re-run failed generation |
| Regenerate | Re-run TTS generation |
| Delete | Remove generation |

---

## Audio Studio Tab

### Header

| Button | Shortcut | Action |
|---|---|---|
| Save | Ctrl+S | Save session |
| Paste | — | Paste clip as new track |
| Load | Ctrl+O | Load saved session |
| Undo | Ctrl+Z | Undo last action |
| Redo | Ctrl+Y | Redo last action |
| Automation | — | Toggle automation lanes |
| Export | — | Offline render export |
| Export+FX | — | Server bounce with plugins |

### Transport

| Button | Shortcut | Action |
|---|---|---|
| Skip to start | — | Reset to time 0 |
| Play/Pause | Space | Toggle playback |
| Stop | — | Stop playback |
| Loop | — | Toggle loop mode |
| Add marker | — | Add timeline marker |
| Record | R | Start/stop recording |

### Track Management

| Button | Action |
|---|---|
| + Track | Add new track |
| Import | Import audio to track |
| MIDI | Add MIDI note |

### Per-Track

| Button | Action |
|---|---|
| M | Mute track |
| S | Solo track |
| F | Toggle spectrogram |
| PL | Toggle plugin panel |
| K+ | Add automation keyframe |
| Kx | Clear automation |
| XF | Toggle crossfade |
| Trash | Remove track |

---

## Stories Tab

### Story List

| Button | Action |
|---|---|
| + New Story | Create story dialog |
| ... > Edit | Edit story |
| ... > Delete | Delete story |

### Story Content

| Button | Action |
|---|---|
| Paste | Paste clip from clipboard |
| + Add | Add generation or import |
| Import Audio | Import audio file |
| Export | Export combined audio |

### Editor Toolbar

| Button | Shortcut | Action |
|---|---|---|
| Play/Pause | Space | Play/pause |
| Stop | — | Stop |
| Split | S | Split at playhead |
| Duplicate | Cmd/Ctrl+D | Duplicate clip |
| Delete | Delete/Backspace | Delete clip |
| Regenerate | — | Re-run TTS |

### Edit Tools (Scissors menu)

| Action | Description |
|---|---|
| Copy clip | Copy to clipboard |
| Cut clip | Cut to clipboard |
| Paste as new clip | Paste as new item |
| Expand/time-stretch | Apply time-stretch |
| Shout -> Whisper | Transform style |
| Blend with next | Blend clips |

### Clip Tools (Settings2 menu)

| Action | Description |
|---|---|
| Add/Remove Fade | Toggle 500ms fade |
| Boost/Reset Gain | Toggle +3dB gain |
| Normalize | Normalize to -14 LUFS |
| Reverse | Reverse audio |
| Remove Silence | Remove silent sections |

---

## Captures Tab

### Action Bar

| Button | Action |
|---|---|
| Configure | Link to Settings > Captures |
| Import | Import audio for transcription |
| Dictate | Start dictation recording |
| Stop | Stop dictation |

### Capture Detail

| Button | Action |
|---|---|
| Refined tab | Show LLM-refined transcript |
| Raw tab | Show raw STT transcript |
| Play As | TTS playback with selected voice |
| Copy | Copy transcript to clipboard |
| Refine/Re-Refine | Send through LLM |
| Export > Audio | Export audio as WAV |
| Export > Transcript | Export as .txt |
| Export > Markdown | Export as .md |
| Delete | Delete capture |

---

## Voices Tab

| Button | Action |
|---|---|
| + New Voice | Create voice profile dialog |
| Search | Filter voices |
| Change avatar | Upload avatar image |
| Remove avatar | Remove avatar |
| Save Changes | Save profile |

---

## Effects Tab

| Button | Action |
|---|---|
| + New Preset | Create custom preset |
| Delete | Delete custom preset |
| Save | Save changes |
| Save as Custom | Copy built-in to custom |
| Preview | Preview effects |

---

## Settings Tab

### General

| Button | Action |
|---|---|
| Save | Save server URL |
| Documentation | Open docs site |
| Discord | Open Discord |
| Keep Server Running | Toggle persistence |
| Network Access | Toggle remote/local |
| Check for Updates | Check new version |
| Download Update | Download update |
| Restart and Install | Restart + install |

### API Keys

| Button | Action |
|---|---|
| + Add | Add API key provider |
| Set as default | Set default provider |
| Delete | Delete provider |
| Save | Save provider |
| Cancel | Cancel adding |

---

## Voice Chat Overlay

| Button | Shortcut | Action |
|---|---|---|
| Mic | V | Start voice chat |
| Stop | — | Cancel AI response |
| Settings | — | Toggle settings |
| History | — | Toggle history |
| X | V | End voice chat |
| Allow | — | Confirm tool execution |
| Deny | — | Deny tool execution |

---

## Assistant Panel

| Button | Action |
|---|---|
| Key icon | Toggle model settings |
| X icon | Close panel |
| Send icon | Send message |
| Suggestion buttons | Send predefined prompt |

---

## Keyboard Shortcuts Summary

| Key | Context | Action |
|---|---|---|
| Space | Generate/Studio/Stories | Play/pause |
| Enter | Generate | Submit generation |
| R | Audio Studio | Record |
| S | Stories | Split clip |
| Delete | Stories | Delete clip |
| Cmd/Ctrl+D | Stories | Duplicate clip |
| Ctrl+S | Audio Studio | Save session |
| Ctrl+O | Audio Studio | Load session |
| Ctrl+Z | Audio Studio | Undo |
| Ctrl+Y | Audio Studio | Redo |
| V | Voice Chat | Toggle voice chat |
