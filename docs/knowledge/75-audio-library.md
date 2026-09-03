# Audio Library

> **PURPOSE** — How to use the unified Audio Library to browse, tag, and manage all your audio clips.
> **OWNS** — The library feature (backend routes + frontend LibraryTab).
> **READ-WHEN** — Managing a large collection of clips, organizing by tags, or batch-moving clips between tabs.

## What is the Audio Library?

The Audio Library is a centralized view of every audio clip in otoyin — generations, captures, story items, DSP output, and audiobook utterances. Instead of hunting through different tabs, you can browse, search, tag, and manage everything in one place.

## Opening the Library

Click **Library** in the sidebar. The library loads all clips with metadata (name, duration, source, tags).

## Browsing clips

- **Search** — type in the search bar to filter by name or text content
- **Sort** — click column headers to sort by date, duration, or name
- **Filter by source** — use the source dropdown to show only generations, captures, etc.

## Tagging clips

Tags let you organize clips across categories:

1. Select one or more clips (checkbox or Ctrl+click)
2. Click **Add Tag** in the action bar
3. Type a tag name (e.g., "podcast-ep1", "music-bed", "voiceover")
4. The tag is applied to all selected clips

### Tag management

- Click the tag count on any clip to see its tags
- Click a tag name to filter the library to all clips with that tag
- Delete a tag from the tag manager (Settings → Tags) — this removes the tag from all clips

## Batch operations

Select multiple clips and use the action bar:

| Action | What it does |
|--------|-------------|
| **Add Tag** | Apply a tag to all selected clips |
| **Remove Tag** | Remove a tag from all selected clips |
| **Delete** | Permanently delete selected clips |
| **Send to Studio** | Open selected clips in Audio Studio |
| **Export** | Download selected clips as a zip |

## Clip sources

| Source | Where it comes from |
|--------|-------------------|
| generation | TTS output from the Generate tab |
| capture | Recording from the Captures tab |
| profile_sample | Reference audio attached to a voice profile |
| audiobook_utterance | A line from an audiobook chapter |
| dsp | Output from the Synth/DSP tab |

## Integration with other tabs

- **History row** — click the library icon on any generation history row to open it in the library
- **Capture detail** — use "Add to Library" to tag a capture for later
- **Audio Studio** — drag clips from the library into the studio timeline

## Storage

All clips are stored on disk in the otoyin data directory. The library is a database index over the files — deleting a clip from the library also deletes the file.

## Pitfalls

- **Deleted clips are gone** — there's no undo for library deletion
- **Tags are per-clip** — tagging a clip doesn't tag its duplicates
- **Large libraries are slow** — the library loads all clips at once; for 1000+ clips, use search/filter
