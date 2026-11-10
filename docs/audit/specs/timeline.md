# Spec: Timeline

## Goal
Arrange audio clips on a timeline with drag/drop, snap, zoom, playback, undo/redo, export session.

## User story
User imports clips → drags onto timeline → snaps to grid → plays → exports mixed session.

## Layout
- Top: transport (play/stop, zoom, snap toggle, undo/redo)
- Middle: timeline ruler + track lanes with clips
- Bottom: clip inspector (trim, gain, fade) + export button

## States
- Empty: drop zone + "Import audio" button
- Loading: spinner on import
- Running: playback cursor moving
- Done: clips placed
- Error: toast + retry

## Controls/defaults
- Snap: 1s default, toggle; zoom: fit-to-view default
- Undo/redo: Ctrl+Z/Ctrl+Shift+Z

## Backend calls
- Client-side arrangement; export via `/export` or DAW export service.

## Acceptance criteria
- Can drag clip from library to lane; clip snaps to 1s grid when snap on.
- Undo reverses move; redo restores.
- Export produces audio file.