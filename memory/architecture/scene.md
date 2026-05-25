# Subsystem: Scene

*This document describes the conceptual design of the scene subsystem: the entity model, rendering, viewport, and persistence. It is paired with `scene-log.md`. Read the architecture spine (`architecture.md`) first.*

## Purpose & Role

Owns *what exists on the canvas and how it is drawn and saved*. Holds the central reactive store (the authored state) and renders it to SVG. The solver reads geometry from here and writes derived feeders back; the scene paints them.

## Key Design Points

**Entity model (authored vs. derived).** Authored entities are persisted and user-controlled: **Bubble** (position, productId, recipe variant pointer, `private` flag, and `outputTarget: railId | null` — the bus its output is bound to) and **Rail** (a *bus* — a polyline carrying `resourceTypes: string[]` (≥1) with an optional `label`, plus a `supply` flag and optional parametric origin `{parentRailId, t}` for forks; a rail is **never** anchored to a bubble). **Feeder** and **output connector** are *derived* — produced by the solver from current geometry, never persisted, never selectable: a feeder carries a rail-or-bubble source to a bubble input (direct line); an output connector carries a bubble's output to its bound rail (orthogonal). This authored/derived split is the project's central invariant (see Codebase Guide). Legacy diagrams with a single `resourceType` are migrated to `resourceTypes:[…]` on load, and any legacy `bubbleOrigin` rails are dropped/normalized away (`persistence.normalizeRail`).

**Rendering.** Hand-rolled SVG (not a node-graph lib) because rails are polylines you attach to anywhere along and fork parametrically — a model off-the-shelf libs don't express. Draw order: **rails → bubbles → feeders & output connectors → missing-state badges**. Order is cosmetic since derived links are non-attachable, but fixed for predictable layering.

**Viewport.** Pan/zoom over an effectively infinite canvas; screen↔world coordinate transform shared with hit-testing and the solver.

**Persistence.** Scene serializes to JSON (authored entities only — feeders regenerate). Autosave to localStorage; explicit JSON file import/export for offline portability. No backend.

See `scene-log.md` for planned work.
