# Subsystem: Solver

*This document describes the conceptual design of the solver subsystem: how feeders and missing-requirement states are derived. It is paired with `solver-log.md`. Read the architecture spine (`architecture.md`) first.*

## Purpose & Role

The solver is the engine that makes the canvas feel alive. Given the authored scene (bubbles + rails) and the recipe data, it derives every **feeder** and every **missing-requirement** flag from scratch. It is a pure function of authored state — nothing it produces is persisted or attachable.

## Key Design Points

**Source resolution.** For each bubble, expand its selected recipe into required input resources. For each unmet input, search candidate **sources** of that resource type: every supply-enabled **rail** (by nearest point on its polyline) and every matching **bubble output**, excluding `private` sources. A bubble source attaches at its **center** (the feeder renders behind the bubble, so it reads as emanating from it). Pick the nearest by **straight-line (Euclidean) distance**. If no source exists, mark that input **missing**.

**Feeder routing.** Feeders are **orthogonal trunks** that reserve space on a global grid (`solver/feederRouting.ts`): each feeder runs perpendicular to the rail it taps, in a reserved **lane** (a vertical X-lane off a horizontal rail, a horizontal Y-lane off a vertical rail), then makes a short jog to the input tab. The rail attach point slides freely along the tapped segment so the trunk lane *is* the attach coordinate (no extra jog at the rail end); bubble→bubble feeders use a vertical trunk near the target port. Lanes are multiples of a grid pitch; two trunks conflict only when they share a lane *and* their perpendicular spans overlap, so the allocator searches outward from the ideal lane (the port's coordinate) to the first free one. Allocation runs in a **deterministic feeder order**, so the same scene always yields the same lanes — feeders don't pop between lanes on every re-solve. This is **feeder-feeder legibility spacing, not obstacle avoidance**: feeders still cross bubbles, rails, and (in their jogs) each other freely; only the trunks are deconflicted. Rendering clips all lines to a ~15px halo around every bubble (`bubble-halo` SVG mask in `Canvas`) and draws lines behind bubbles. *(History: orthogonal L/Z 2026-05-23 → direct straight lines same day because unspaced right-angles were hard to read → back to orthogonal **with global lane reservation** 2026-05-28, since spacing was the missing ingredient: lane-separated trunks read as tidy plumbing and, unlike the direct model, never stack even across different rails.)*

**Reactivity.** A single recompute pass regenerates all feeders whenever authored geometry changes (bubble moved, rail edited/forked/toggled, recipe switched, entity added/removed). Because feeders are non-attachable derived output, recompute order is irrelevant — there is no dependency cascade between feeders. This is *the* property that keeps drag/fork/redraw simple.

See `solver-log.md` for planned work.
