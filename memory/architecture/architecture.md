# Architecture

*This is the conceptual spine of the project. It describes what the system is, why it is shaped the way it is, and how the major subsystems relate to each other. It is charter, not code map — the Codebase Guide covers code layout and invariants.*

*Subsystem subdocs branch from this spine: each lives at `memory/architecture/<subsystem>.md` and carries a paired feature log at `memory/architecture/<subsystem>-log.md`. Subdocs are prose-driven (Azimuth style) — short italicized orientation header, then pure narrative. They grow through user-agent dialogue; do not pre-instantiate them.*

*When adding a subsystem subdoc: create the file from `templates/architecture-subdoc-stub.md`, fill the orientation header, then write narrative prose. Categories and entries in the paired log grow organically — no pre-baked structure.*

## System Purpose

Factorio Plotter is an offline, single-page visual planning tool: an Obsidian-style graph canvas where **bubbles** represent broad factory concepts (intermediate products like green/red/blue circuits) and **rails** represent typed resource supply lines. Bubbles declare recipe inputs and the tool auto-draws orthogonal **feeder** connections from each input to the nearest matching source — letting the user rough-sketch the *shape* of a factory (resource dependencies and bus layout) without simulating belts, machines, or power.

## Subsystems

- **[Recipes](recipes.md)** — product→inputs mapping; bundled set + custom/override layer + per-bubble variant selection. Source of truth the solver reads.
- **[Scene](scene.md)** — entity model (Bubble/Rail/Feeder), reactive store, SVG rendering, pan/zoom viewport, JSON/localStorage persistence.
- **[Solver](solver.md)** — derives all feeders and missing-requirement flags from authored state: nearest-source resolution + orthogonal routing + reactive recompute.
- **[Editing](editing.md)** — direct manipulation: place bubbles, draw/extend/bend/fork rails (parametric origins), drag, supply/private toggles.

**Central invariant:** authored geometry (rails, bubbles) is persistent, attachable, and forkable; derived geometry (feeders) is recomputed and never an attachment target. See `memory/Codebase Guide.md`.
