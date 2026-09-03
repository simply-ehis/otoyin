# 31 — Generation Cancellation

PURPOSE: Allow users to cancel in-progress generations from the UI — backend supports CancelledError but frontend needed a button/shortcut.
OWNS: Cancel button in generation history and main editor, backend CancelledError handling.
READ-WHEN: You touch generation UI, history table, or generation lifecycle.
KEY-FILES: app/src/components/Generation/GenerateButton.tsx, backend/routes/generations.py, backend/services/generation.py
INVARIANTS: Cancel button visible only for in-progress generations; sends cancel event to backend; backend cleans up partial chunks.
GOTCHAS: Backend already handles CancelledError — frontend just needs to trigger it via the cancel endpoint.
UPDATED: 2026-08-21

## Agent Callable

| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Cancel generation | `21labs.cancel_generation` | `POST /generations/{id}/cancel` | `backend/routes/generations.py` |
| Generation status | `21labs.generation_status` | `GET /generations/{id}/status` | `backend/routes/generations.py` |

## How It Works

### Cancel Flow
1. User clicks cancel button on in-progress generation (history table or main editor)
2. Frontend sends `POST /generations/{id}/cancel`
3. Backend sets cancellation flag on the generation
4. SSE connection emits `cancelled` event
5. Frontend clears generation state, cleans up chunk queue
6. Backend cleans up partial chunk files

### UI Integration
- **Generate Button**: Shows cancel spinner during generation, click to cancel
- **History Table**: Cancel button on each in-progress row
- **Keyboard Shortcut**: `Escape` cancels current generation

### Backend Handling
```python
@router.post("/generations/{generation_id}/cancel")
async def cancel_generation(generation_id: str, db: Session = Depends(get_db)):
    gen = db.query(Generation).get(generation_id)
    if gen and gen.status == "generating":
        gen.status = "cancelled"
        db.commit()
        # Clean up partial chunks
        cleanup_partial_chunks(generation_id)
    return {"status": "cancelled"}
```
