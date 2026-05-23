# Feature Log: Solver

*Tracks planned features, open bugs, and completed work for the solver subsystem.*

## Source Resolution

- [ ] (planned: 2026-05-23) Expand a bubble's selected recipe into its required input resource set.
- [ ] (planned: 2026-05-23) Nearest-source search per unmet input: supply rails (nearest point on polyline) + matching bubble outputs, excluding `private`, by orthogonal distance.
- [ ] (planned: 2026-05-23) Missing-requirement detection: flag inputs with no matching source.

## Feeder Routing

- [ ] (planned: 2026-05-23) Orthogonal feeder pathing from bubble input port to chosen source point (L/Z routes). No collision avoidance — feeders may cross any bubble/rail/feeder; user tidies by dragging.

## Reactivity

- [ ] (planned: 2026-05-23) Single recompute pass that regenerates all feeders + missing flags on any authored-geometry change; wire to store mutations.
