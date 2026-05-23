# Feature Log: Editing

*Tracks planned features, open bugs, and completed work for the editing subsystem.*

## Placement

- [ ] (planned: 2026-05-23) Click-to-place bubble with a palette/selector for choosing the product.
- [ ] (planned: 2026-05-23) "Draw rail" tool mode: lay a typed polyline on the canvas and assign its resource.

## Manipulation

- [ ] (planned: 2026-05-23) Drag bubbles (pointer drag → store update → solver recompute).
- [ ] (planned: 2026-05-23) Rail endpoint editing: extend and bend at endpoints.
- [ ] (planned: 2026-05-23) Rail T-fork: pull a branch from anywhere along a rail; store origin as parametric `{parentRailId, t}` that slides (clamped) when the parent reshapes.

## Toggles

- [ ] (planned: 2026-05-23) Rail supply ↔ non-supply (private) toggle; retriggers recompute.
- [ ] (planned: 2026-05-23) Bubble private toggle (exclude its output as a source); retriggers recompute.
