# Architecture

*This is the conceptual spine of the project. It describes what the system is, why it is shaped the way it is, and how the major subsystems relate to each other. It is charter, not code map — the Codebase Guide covers code layout and invariants.*

*Subsystem subdocs branch from this spine: each lives at `memory/architecture/<subsystem>.md` and carries a paired feature log at `memory/architecture/<subsystem>-log.md`. Subdocs are prose-driven (Azimuth style) — short italicized orientation header, then pure narrative. They grow through user-agent dialogue; do not pre-instantiate them.*

*When adding a subsystem subdoc: create the file from `templates/architecture-subdoc-stub.md`, fill the orientation header, then write narrative prose. Categories and entries in the paired log grow organically — no pre-baked structure.*

## System Purpose

Factorio Plotter is an offline, single-page visual planning tool: an Obsidian-style graph canvas where **bubbles** represent broad factory concepts (intermediate products like green/red/blue circuits) and **rails** represent resource supply lines — *buses* carrying one or more resource types (a plain rail is a bus of one; a Fulgora "scrap" bus carries all 12 recycling outputs). Bubbles declare recipe inputs and the tool auto-draws direct (straight-line) **feeder** connections from each input to the nearest matching source — letting the user rough-sketch the *shape* of a factory (resource dependencies and bus layout) without simulating belts, machines, or power. (Authored rails stay orthogonal; only the derived feeders are direct.)

A bubble is symmetric: it *taps inputs off* a bus and *emits its output onto* a bus. The output side is the mirror of the input side — the user **binds** a bubble's output to a target bus, the product joins that bus (a new lane on a multi-item bus), and the solver draws a derived orthogonal **output connector** from the bubble to the rail. Downstream bubbles needing that product then auto-feed off the same bus. (This supersedes the earlier "branch an anchored rail off a bubble" model: rails are never anchored to bubbles; the bubble↔bus link is always a derived connector, like a feeder reversed.)

## Subsystems

- **[Recipes](recipes.md)** — product→inputs mapping; bundled set + custom/override layer + per-bubble variant selection. Source of truth the solver reads.
- **[Scene](scene.md)** — entity model (Bubble/Rail/Feeder), reactive store, SVG rendering, pan/zoom viewport, JSON/localStorage persistence.
- **[Solver](solver.md)** — derives all feeders and missing-requirement flags from authored state: nearest-source resolution + orthogonal routing + reactive recompute.
- **[Editing](editing.md)** — direct manipulation: place bubbles, draw/extend/bend/fork rails (parametric origins), drag, supply/private toggles.

**Central invariant:** authored geometry (rails, bubbles) is persistent, attachable, and forkable; derived geometry (feeders **and output connectors**) is recomputed and never an attachment target. Rails are never anchored to bubbles — every bubble↔bus link is a derived connector. See `memory/Codebase Guide.md`.
