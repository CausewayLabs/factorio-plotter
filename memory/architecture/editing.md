# Subsystem: Editing

*This document describes the conceptual design of the editing subsystem: how the user creates and manipulates authored entities. It is paired with `editing-log.md`. Read the architecture spine (`architecture.md`) first.*

## Purpose & Role

Owns all direct manipulation: placing bubbles, drawing and reshaping rails, dragging, and toggling state. Every editing action mutates *authored* state only; the solver reacts. Editing never touches feeders directly.

## Key Design Points

**Placement.** Adding a bubble is a single click on the canvas with a palette selector choosing the product. A "draw rail" tool mode lets the user lay a typed polyline — **always orthogonal**: each clicked vertex snaps to horizontal/vertical relative to the previous one (see Codebase Guide invariant). Beyond the toolbar's +Bubble/+Rail buttons, the user can **double-click empty canvas** to summon a quick-add menu (Bubble/Rail) at the cursor; the picked entity is placed (bubble) or seeded (rail's first vertex) at that exact point. The product/resource pickers are filterable and keyboard-drivable (type → ↑/↓ → Enter).

**Rail editing is all intuitive, all safe.** Because rails are immune to bubble movement, the user can freely (in select mode, default cursor): **drag an endpoint** to stretch/reshape it (snapped H/V to keep rails orthogonal), **drag the rail body** to relocate the whole polyline, or pull a **T-branch** from anywhere along a rail. A plain click on a rail (press with no drag) opens its materials menu. A fork is a new rail whose origin is parametric — `{parentRailId, t}` ("t along parent") — so when the parent reshapes, the child's origin slides along it (clamped to ends); a fork's first point is therefore not a draggable handle. Forks form a tree of rails.

**Emitting a bubble's output onto a bus.** A bubble both taps inputs *and* emits its output — the output side mirrors the input side. In select mode, **drag out from the bubble's output-port dot** (dragging the dot starts an emit; dragging the bubble body still relocates it). Where you drop decides the result: **drop on an existing rail** → the bubble's product is added to that bus's `resourceTypes` and the bubble binds to it (`outputTarget`); **drop on empty space** → a new single-resource rail carrying the product is created there and the bubble binds to it. Either way the rail is plain free orthogonal geometry — *never* anchored to the bubble. The bubble↔bus link is a derived orthogonal **output connector** drawn by the solver; it re-routes when either the bubble or the rail moves. Once the product is on the bus, downstream bubbles auto-feed off it. (Almost all Factorio buses are bundles of parallel lines; prefer pushing every product onto one multi-item bus rather than drawing a separate rail per product.)

**The forbidden operation.** You may never attach to or fork off a **feeder or an output connector** — only authored rails (and a bubble's output port, as an emit source) are valid targets. This single rule is what dissolves the "fork off an auto-line then move the bubble" complexity: it cannot arise.

**Toggles.** Rails toggle supply ↔ non-supply (private); bubbles toggle private (others can't tap my output). Both retrigger solver recompute.

See `editing-log.md` for planned work.
