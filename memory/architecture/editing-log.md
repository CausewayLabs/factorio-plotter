# Feature Log: Editing

*Tracks planned features, open bugs, and completed work for the editing subsystem.*

## Placement

- [x] (planned: 2026-05-23, completed: 2026-05-23) Click-to-place bubble with a ProductPicker palette for choosing the product.
- [x] (planned: 2026-05-23, completed: 2026-05-23) "Draw rail" tool mode: click vertices, double-click to finish; ResourcePicker assigns the rail's resource.

## Manipulation

- [x] (planned: 2026-05-23, completed: 2026-05-23) Drag bubbles (pointer drag → `moveBubble` → solver recompute via microtask).
- [ ] (planned: 2026-05-23) Rail endpoint editing: extend and bend at endpoints. — partial: store has `updateRailPoints(id, points)` but no UI gesture wires endpoint dragging yet.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Rail T-fork: pull a branch from a rail; origin stored as parametric `{parentRailId, t}`, resolved at read time in both solver and hit-test so it slides (clamped) when the parent reshapes.
- [ ] (planned: 2026-05-23) Polish fork-rail UX: the toolbar hint says "Click on a rail to fork it," but the actual flow requires right-clicking a rail → "Fork Rail" first to set the target. Align the hint/flow (QA note).

## Toggles

- [x] (planned: 2026-05-23, completed: 2026-05-23) Rail supply ↔ non-supply (private) toggle (rail context menu); retriggers recompute.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Bubble private toggle (bubble context menu, excludes its output as a source); retriggers recompute.
