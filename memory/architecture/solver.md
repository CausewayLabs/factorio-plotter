# Subsystem: Solver

*This document describes the conceptual design of the solver subsystem: how feeders and missing-requirement states are derived. It is paired with `solver-log.md`. Read the architecture spine (`architecture.md`) first.*

## Purpose & Role

The solver is the engine that makes the canvas feel alive. Given the authored scene (bubbles + rails) and the recipe data, it derives every **feeder** and every **missing-requirement** flag from scratch. It is a pure function of authored state — nothing it produces is persisted or attachable.

## Key Design Points

**Source resolution.** For each bubble, expand its selected recipe into required input resources. For each unmet input, search candidate **sources** of that resource type: every supply-enabled **rail** (by nearest point on its polyline) and every matching **bubble output** (its output port), excluding `private` sources. Pick the nearest by orthogonal/Manhattan distance. If no source exists, mark that input **missing**.

**Feeder routing.** Route an orthogonal (right-angle) path from the bubble's input port to the chosen source point. Routing is **purely geometric — no collision/obstacle avoidance.** Feeders may freely cross bubbles, rails, and other feeders; producing a clean picture is the user's job (drag bubbles to tidy). Simple L/Z-shaped orthogonal routes suffice.

**Reactivity.** A single recompute pass regenerates all feeders whenever authored geometry changes (bubble moved, rail edited/forked/toggled, recipe switched, entity added/removed). Because feeders are non-attachable derived output, recompute order is irrelevant — there is no dependency cascade between feeders. This is *the* property that keeps drag/fork/redraw simple.

See `solver-log.md` for planned work.
