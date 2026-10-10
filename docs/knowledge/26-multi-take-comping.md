# 26 — Multi-Take Comping

Stack multiple take lanes and select the best regions to build a composite performance.

## Route

`/workspace/comping` — MultiTakeCompingView

## Frontend (`MultiTakeCompingView.tsx`)

- Take lanes with color-coded regions
- Click regions to select the best take for each time segment
- Add/remove lanes and regions
- Comp result preview showing selected regions stitched together
- Timeline ruler with position markers

## Data Model

```typescript
interface TakeRegion {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
}

interface TakeLane {
  id: string;
  name: string;
  color: string;
  regions: TakeRegion[];
  selectedRegionId: string | null;
}
```

## Workflow

1. Import or record multiple takes of the same passage
2. Each take becomes a lane with regions
3. Click regions across lanes to select the best parts
4. Comp result shows the stitched composite
5. Play comp to preview the final performance

## Use Cases

- Vocal comping: select best phrases from multiple recordings
- ADR comping: match lip sync across takes
- Podcast comping: pick best ad-libs and reactions

## Agent Callable
- **MCP Tools:** (none — comping is UI-initiated)
- **REST Endpoints:** `POST /comping/assemble`, session CRUD via `/comping/sessions/*`
- **Key Backend Files:** `backend/routes/comping.py`, `backend/routes/comping_sessions.py`
- **Key Frontend Files:** `app/src/features/workspace/MultiTakeCompingView.tsx`
