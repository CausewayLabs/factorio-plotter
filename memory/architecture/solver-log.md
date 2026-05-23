# Feature Log: Solver

*Tracks planned features, open bugs, and completed work for the solver subsystem.*

## Source Resolution

- [x] (planned: 2026-05-23, completed: 2026-05-23) Expand a bubble's selected recipe into its required input resource set.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Nearest-source search per unmet input: supply rails (nearest point on polyline) + matching non-private bubble outputs, by Manhattan distance.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Missing-requirement detection: `missingInputs` Set of inputs with no matching source.

## Feeder Routing

- [x] (planned: 2026-05-23, completed: 2026-05-23) Orthogonal feeder pathing (L/Z routes) from bubble input port to chosen source point; degenerate aligned cases collapse to a straight segment. No collision avoidance — feeders may cross any bubble/rail/feeder.

## Reactivity

- [x] (planned: 2026-05-23, completed: 2026-05-23) Single recompute pass regenerating all feeders + missing flags on any authored-geometry change. — decision: store mutations signal via `registerSolverCallback` + `queueMicrotask` (coalesces bursts into one pass); `triggerManualRecompute` covers recipe-store changes that the scene store can't observe directly.
