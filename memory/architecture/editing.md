# Subsystem: Editing

*This document describes the conceptual design of the editing subsystem: how the user creates and manipulates authored entities. It is paired with `editing-log.md`. Read the architecture spine (`architecture.md`) first.*

## Purpose & Role

Owns all direct manipulation: placing bubbles, drawing and reshaping rails, dragging, and toggling state. Every editing action mutates *authored* state only; the solver reacts. Editing never touches feeders directly.

## Key Design Points

**Placement.** Adding a bubble is a single click on the canvas with a palette selector choosing the product. A "draw rail" tool mode lets the user lay a typed polyline.

**Rail editing is all intuitive, all safe.** Because rails are immune to bubble movement, the user can freely: drag an endpoint to extend, bend at an endpoint, or pull a **T-branch** from anywhere along a rail. A fork is a new rail whose origin is parametric — `{parentRailId, t}` ("t along parent") — so when the parent reshapes, the child's origin slides along it (clamped to ends). Forks form a tree of rails.

**The forbidden operation.** You may never attach to or fork off a **feeder** — only authored rails and bubble outputs are valid targets. This single rule is what dissolves the "fork off an auto-line then move the bubble" complexity: it cannot arise.

**Toggles.** Rails toggle supply ↔ non-supply (private); bubbles toggle private (others can't tap my output). Both retrigger solver recompute.

See `editing-log.md` for planned work.
