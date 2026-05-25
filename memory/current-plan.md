# Current Plan

*Active plan written by `/next-plan`. Overwritten each time `/next-plan` runs. Check off steps as you complete them. Create a handoff doc in `memory/handoffs/` only if work genuinely gets stuck mid-plan — most plans should resume from this file + recent git activity without ceremony.*

## Plan: Replace bubble-anchored rails with the output-connector model

**Why:** Anchoring a rail to a bubble (`bubbleOrigin`) made every drag either slope the rail or silently re-derive its length. A bubble's output is the *mirror of its input* — model it as an explicit binding plus a derived orthogonal connector (a feeder reversed). Rails stay free, orthogonal, authored geometry. Charter already updated (architecture spine, Codebase Guide invariants, editing + scene subdocs, editing-log).

**Model (locked):**
- `Bubble.outputTarget: railId | null` — the bus this bubble's output is bound to (authored).
- Drop emit-drag on a rail → add product to `rail.resourceTypes` + set `outputTarget`. Drop on empty → create a new single-resource rail + bind.
- Solver draws a derived **orthogonal** output connector: `bubbleOutputPort` → nearest point on resolved rail. Re-routes on any move.
- Downstream consumption is automatic — `rail.resourceTypes` stays the single source of truth for "what's on a bus"; no solver *matching* change.

### Steps

- [x] **1. Back out `bubbleOrigin`.** Removed from `Rail` (`scene/types.ts`), its branch in `resolveRailPolyline` (`scene/geometry.ts`; signature now `(rail, rails)`), anchored-start handling in `hitTest.ts`/`RailLayer.tsx`, the whole `bubbleBusDrag` path in `Canvas.tsx`, and normalization in `persistence.ts` (dropped on load).
- [x] **2. Add the binding.** `Bubble.outputTarget: railId | null` added; `setBubbleOutputTarget` store action; `normalizeBubble` backfills on load; bubble literals in `App.tsx`/`Canvas.tsx` updated.
- [x] **3. Emit gesture (Canvas).** Output-port drag reworked: drop on a rail (`hitTest` via `worldToScreen`) → `setBubbleOutputTarget` + add productId to `resourceTypes` (canonical dedupe); drop on empty → create rail + bind. Live preview = `orthogonalConnector` port→cursor.
- [x] **4. Solver output connectors.** Distinct `OutputConnector` type; `orthogonalConnector` helper in `geometry.ts`; solver emits port → nearest point on resolved rail; published in `SolverOutput` + threaded through store/reactivity/Toolbar.
- [x] **5. Render.** `OutputConnectorLayer.tsx` (solid orthogonal, colored by product), drawn after feeders inside the halo mask. Non-interactive.
- [x] **6. Delete cleanup.** `deleteRail` clears `outputTarget` on bubbles pointing at the deleted rail. (Bubble delete drops its own binding automatically.)
- [x] **7. Typecheck.** `npx tsc --noEmit` passes clean. Manual in-app smoke still pending (see below).

### Chosen: distinct `OutputConnector` type
Decided distinct over tagged-feeder — feeders are direct, connectors orthogonal; conflating muddies routing/rendering.

### Remaining: manual smoke test
Verify in-app: emit onto existing bus, emit to empty space, drag bubble (connector re-routes orthogonally), drag rail (connector re-routes), downstream bubble auto-feeds off the bus.

### Doc drift noted (separate, not this plan)
Codebase Guide once said "orthogonal feeder routing," but feeders are direct 2-point (`pathPoints:[attachPoint, inputPort]`). Spine's "direct (straight-line)" is correct; the Guide line was stale. (Now consistent after this edit pass.)
