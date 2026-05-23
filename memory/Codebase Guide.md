# Codebase Guide

*Code-layout router and invariants. This file answers: where does the code live, and what must always hold? Architecture (`memory/architecture/architecture.md`) answers why — this file answers where and what.*

## Layout

*(Describe the top-level directory structure and what each area owns.)*

## Invariants

*Things that must always hold. Promote load-bearing decisions here from feature log completed entries — do not wait for a prune cycle.*

- **Authored vs. derived geometry is a hard boundary.** Rails and bubbles are *authored* (persistent, user-placed, attachable, forkable). Feeders are *derived* (recomputed by the layout solver from current geometry, never selectable, never an attachment target). You may only attach to / fork off authored objects.
- **Rails are immune to bubble movement.** A rail's shape changes only when the user edits it. Moving a bubble re-runs the solver but never moves a rail.
- **Each rail is typed to exactly one resource.** No multi-resource buses.
- **No collision avoidance.** Feeder/rail routing is purely geometric and may cross any bubble, rail, or feeder. The solver never routes around obstacles; layout cleanliness is the user's responsibility (drag bubbles to tidy).
