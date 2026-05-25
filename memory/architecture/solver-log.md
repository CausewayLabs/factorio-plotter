# Feature Log: Solver

*Tracks planned features, open bugs, and completed work for the solver subsystem.*

## Source Resolution

- [x] (planned: 2026-05-23, completed: 2026-05-23) Expand a bubble's selected recipe into its required input resource set.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Nearest-source search per unmet input: supply rails (nearest point on polyline) + matching non-private bubble outputs, by Manhattan distance. — superseded: now ranked by Euclidean distance (feeders are direct lines) and a bubble source attaches at its **center**, not its output port.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Missing-requirement detection: `missingInputs` Set of inputs with no matching source.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Case/hyphen-insensitive source matching: `findNearestSource` compares the needed resource against rail `resourceTypes` and bubble `productId` via `canonicalProductKey` (instead of `includes`/`===`), so authored rails/inputs that drift in case or hyphenation still resolve. — decision: canonical key is a matching aid in `recipes/normalize.ts`; no data rewrite.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Input-side derivation: two-pass per bubble — pass 1 finds each input's nearest source querying from the bubble **center** (side-agnostic), then picks the tab side from `source.x >= center.x` (right) else left; pass 2 assigns per-side indices (`assignSideIndices`), computes the side-aware port, and re-resolves rail attach points against that port. Emits `inputLayouts: Record<bubbleId, InputSlot[]>` in `SolverOutput`. — decision: querying by center (not the port) breaks the port↔source circular dependency the side-snapping would otherwise create, and recomputes live during a drag so tabs flip sides as a source sweeps past 12:00.

## Feeder Routing

- [x] (planned: 2026-05-23, completed: 2026-05-23) Orthogonal feeder pathing (L/Z routes) from bubble input port to chosen source point; degenerate aligned cases collapse to a straight segment. No collision avoidance — feeders may cross any bubble/rail/feeder.
- [x] (planned: 2026-05-23, completed: 2026-05-23) **Switched feeders to direct straight-line paths** (single 2-point segment); removed `routeOrthogonal`. — decision: a dense field of right-angle feeders was hard to read; direct rays fan out and trace more cleanly. Charter (spine + solver.md) updated. Authored rails stay orthogonal. Paired with center-attach for bubble sources and a render-side halo mask.

## Reactivity

- [x] (planned: 2026-05-23, completed: 2026-05-23) Single recompute pass regenerating all feeders + missing flags on any authored-geometry change. — decision: store mutations signal via `registerSolverCallback` + `queueMicrotask` (coalesces bursts into one pass); `triggerManualRecompute` covers recipe-store changes that the scene store can't observe directly.
