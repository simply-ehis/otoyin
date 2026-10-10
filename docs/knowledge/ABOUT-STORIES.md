# About: Stories Tab

> **PURPOSE:** Reference for the Stories tab — long-form audio composition with timeline editing.
> **OWNS:** Stories list, story content, editor toolbar, track editor
> **READ-WHEN:** Working on Stories features, clip editing, timeline
> **KEY-FILES:** `StoriesTab.tsx`, `StoryList.tsx`, `StoryContent.tsx`, `EditorToolbar.tsx`, `StoryTrackEditor.tsx`
> **INVARIANTS:** Stories contain ordered clips; clips can be versions of each other
> **GOTCHAS:** Edit Tools and Clip Tools are separate dropdown menus
> **UPDATED:** 2026-08-07

## Overview

Stories is a long-form audio composition tool. You create stories, add clips (generations or imports), and edit them on a timeline.

## Story List (Left Panel)

| Button | Action |
|---|---|
| + New Story | Open Create Story dialog |
| Story row | Select story |
| ... menu > Edit | Edit story name/description |
| ... menu > Delete | Delete story (with confirmation) |

## Story Content (Right Panel)

| Button | Action |
|---|---|
| Paste | Paste clip from clipboard into story |
| + Add | Open popover to add generation or import |
| Import Audio | Import audio file into story |
| Export | Export story as combined audio |

## Editor Toolbar

### Playback

| Button | Shortcut | Action |
|---|---|---|
| Play/Pause | Space | Play/pause timeline |
| Stop | — | Stop playback |

### Editing

| Button | Shortcut | Action |
|---|---|---|
| Split | S | Split clip at playhead |
| Duplicate | Cmd/Ctrl+D | Duplicate selected clip |
| Delete | Delete/Backspace | Delete selected clip |
| Regenerate | — | Regenerate clip from TTS |

### Clip Controls

| Button | Action |
|---|---|
| Volume | Adjust clip volume |
| Pan | Adjust clip stereo pan |

### Edit Tools Menu (Scissors dropdown)

| Action | Description |
|---|---|
| Copy clip | Copy clip audio to clipboard |
| Cut clip | Cut clip audio to clipboard |
| Paste as new clip | Paste clipboard as new story item |
| Expand/time-stretch | Apply time-stretch |
| Shout -> Whisper | Transform loud to whisper style |
| Blend with next | Blend current clip with next |

### Clip Tools Menu (Settings2 dropdown)

| Action | Description |
|---|---|
| Add/Remove Fade | Toggle 500ms fade in/out |
| Boost/Reset Gain | Toggle +3dB gain boost |
| Normalize | Normalize to -14 LUFS |
| Reverse | Reverse audio |
| Remove Silence | Remove silent sections |

### Other

| Button | Action |
|---|---|
| Version menu | Switch between takes/versions |
| Zoom In/Out | Adjust timeline zoom |

## Agent Callable
- **MCP Tools:** `21labs.list_stories`, `21labs.get_story`, `21labs.create_story`, `21labs.export_story_audio`
- **REST Endpoints:** `GET /stories`, `POST /stories`, `GET /stories/{id}`, `PUT /stories/{id}`, `DELETE /stories/{id}`, `POST /stories/{id}/items`, `DELETE /stories/{id}/items/{itemId}`, `PUT /stories/{id}/items/times`, `PUT /stories/{id}/items/reorder`, `GET /stories/{id}/export-audio`
- **Key Backend Files:** `backend/routes/stories.py`, `backend/services/stories/`
- **Key Frontend Files:** `app/src/features/stories/StoriesTab.tsx`, `app/src/features/stories/StoryList.tsx`, `app/src/features/stories/StoryContent.tsx`, `app/src/features/stories/editor/StoryTrackEditor.tsx`, `app/src/stores/storyStore.ts`
