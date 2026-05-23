# Factorio Plotter

## Feature Requirements

### What We're Building

Factorio Plotter is an **offline, single-page visual planning tool** — an Obsidian-style graph canvas for rough-sketching the *shape* of a Factorio factory at the level of broad concepts. The user drops **bubbles** (intermediate products like green/red/blue circuits) and draws **rails** (typed resource supply lines, the "bus"). Each bubble knows its recipe inputs, and the tool **automatically draws orthogonal "feeder" lines** from every input to the nearest matching source. The goal is to capture resource *dependencies* and bus layout — not to simulate belts, inserters, machines, power, or throughput.

The tool's real power is its **reactivity**: drag a bubble and its feeders re-route; add/move/delete/toggle a rail and every affected bubble re-evaluates which source it draws from (or flips to a "missing requirement" state) — exactly like reconfiguring nodes in an Obsidian graph. Everything derived (feeders, missing-state) recomputes live from the authored geometry.

Because the bundled recipe data is a small curated seed (not a full Factorio scrape), the user is a **first-class author**: they can customize recipes, switch between recipe variants per bubble, and define entirely new products with their own recipes — all to declutter the graph down to the concepts they care about.

### Goals

- Place bubbles by clicking the canvas and picking a product from a palette.
- Draw typed rails (supply lines), and edit them intuitively: extend/bend endpoints, pull a T-branch (fork) from anywhere along a rail.
- Auto-derive feeders: per unmet bubble input, route an orthogonal line to the nearest matching source (a supply rail or another bubble's output).
- Live recompute on every change: dragging bubbles, editing/forking rails, toggling supply/private, switching recipes.
- Surface a clear **missing-requirement** state when an input has no matching source on the canvas.
- Let the user fully author recipe data: custom recipes, per-bubble recipe-variant selection, and brand-new products (with empty recipe = raw/leaf resource).
- Work entirely offline with local persistence (localStorage autosave) and JSON import/export.

### Success Criteria

- The user can build a small factory sketch (e.g. iron/copper/plastic rails feeding a red-circuit bubble, which feeds a blue-circuit bubble) and watch feeders auto-connect.
- Dragging a bubble re-routes its feeders instantly; the picture stays coherent.
- Adding/removing/toggling a rail re-evaluates dependent bubbles, including flipping to/from missing-requirement.
- Forking a rail (T-branch) works and the branch's origin slides along the parent when the parent is reshaped.
- The user can author a new product + recipe and immediately place it as a bubble; referencing a new resource name makes it available as a rail type.
- A diagram survives reload (localStorage) and can be exported/imported as JSON.

### Constraints & Non-Goals

- **No simulation** of belts, splitters, undergrounds, inserters, assembly machines, electricity, or throughput/rates. Resource *shape* only — inputs are named resource types, no quantities.
- **No collision avoidance.** Feeder/rail routing is purely geometric and may cross any bubble/rail/feeder. Layout cleanliness is the user's job (drag to tidy).
- **Rails are typed to exactly one resource** — no multi-resource buses.
- **No backend / no network dependency.** Fully offline.
- Not a full/accurate Factorio recipe database — bundled set is a small hand-seeded curated core; the rest is user-authored.

### Assumptions

- **Authored vs. derived geometry is a hard boundary.** Rails and bubbles are authored (persistent, attachable, forkable). Feeders are derived (recomputed, never selectable, never an attachment target). You may only attach to / fork off authored objects — this dissolves the "fork off an auto-line then move the bubble" complexity.
- **Products and resource types are one namespace.** A product *is* a resource type; a product with an empty recipe is a raw/leaf resource. Bubbles produce a product; rails are typed by resource; recipe inputs name resources.
- **Sources** a feeder may attach to: a supply-enabled rail (nearest point on its polyline) or a non-private bubble's output port. Nearest is by orthogonal/Manhattan distance.
- Stack: **Vite + TypeScript + React + Zustand + hand-rolled SVG** (off-the-shelf node-graph libs don't fit the attach-anywhere-along / parametric-fork rail model). `run.bat` at root for single-command start.
- Full design detail lives in `D:/Projects/factorio plotter/memory/` — architecture spine + 4 subsystem subdocs (recipes, scene, solver, editing) with paired `-log.md` task lists, plus Codebase Guide invariants and Glossary. The Architect should treat these as the authoritative source.

### Open Questions

- Feeder routing shape: simplest L/Z orthogonal route is acceptable for v1; degenerate cases (source directly above/beside bubble) just collapse to a straight segment.
- Exact attach-point semantics on a rail: nearest point on the polyline segment (not nearest endpoint) is the intended behavior.
- Whether the user set (custom products/recipes) persists per-diagram or in a shared cross-diagram store — leaning shared, to resolve during design.

---

## Development Plan

### Overview

Build Factorio Plotter as a Vite + TypeScript + React + Zustand single-page app with hand-rolled SVG rendering, delivered in six sequential-then-parallel phases: project scaffold → entity model & store → recipe data layer → SVG rendering & viewport → solver (feeder derivation) → editing interactions. The authored/derived boundary (rails+bubbles vs. feeders) is the load-bearing structural constraint every task respects.

### Task Breakdown

#### TASK-001: Project Scaffold
- **Model:** Haiku
- **Description:** Vite + TypeScript + React + Zustand project initialized with `run.bat` at root for single-command start (`npm run dev`), ESLint/tsconfig baseline, and empty `src/` directory structure matching planned subsystem layout (`recipes/`, `scene/`, `solver/`, `editing/`, `components/`).
- **Scope:** Toolchain setup only — no business logic, no types, no UI. `run.bat` must start the dev server with one command.
- **Acceptance Criteria:** `run.bat` launches the dev server; browser shows a blank React app with no console errors; TypeScript strict mode is on.
- **Dependencies:** None
- **Execution:** Parallel — no dependencies

#### TASK-002: Core Entity Types & Zustand Store
- **Model:** Sonnet
- **Description:** TypeScript definitions for all authored and derived entities (`Bubble`, `Rail`, `Feeder`, `ParametricOrigin`) plus the Zustand store shape: authored-state slice (bubbles map, rails map), derived-state slot (feeders array), and the screen↔world viewport transform. Includes bare-minimum store mutation stubs (add/move/delete for bubble and rail) that signal solver recompute but don't yet implement it.
- **Scope:** Types + store shape + mutation stubs. No rendering, no solver logic, no editing gestures yet. Parametric fork origin `{parentRailId, t}` must be typed on Rail.
- **Acceptance Criteria:** TypeScript compiles with no errors. Store can hold multiple bubbles + rails; mutations update state. Feeders slot exists and accepts an array. No circular imports between subsystems.
- **Dependencies:** TASK-001
- **Execution:** Sequential — must follow TASK-001

#### TASK-003: Recipe Data Layer
- **Model:** Sonnet
- **Description:** Bundled recipe JSON (core Factorio intermediates: circuits, plates, steel, plastic, gears — curated, not exhaustive) with schema `{ product, variantId, label, inputs: string[], isDefault }`. User-set store (Zustand slice persisted to localStorage) that merges on top of the bundled set. Selector to resolve the active recipe for a given `(productId, variantId)`. No UI yet.
- **Scope:** Data schema, bundled JSON seed, user-set merge logic, localStorage persistence of user set, typed selectors. No editor UI, no palette. User set is shared (cross-diagram), not per-diagram.
- **Acceptance Criteria:** Resolving a stock product returns its bundled recipe. Adding a user product or variant surfaces correctly in the merged catalog. Reload preserves user set. A product with empty inputs resolves as a raw/leaf resource.
- **Dependencies:** TASK-001
- **Execution:** Parallel with TASK-002 — both depend only on TASK-001

#### TASK-004: SVG Rendering & Viewport
- **Model:** Sonnet
- **Description:** Full SVG scene renderer with pan/zoom viewport. Draw order: rails → bubbles → feeders → missing-state badges. Rail visuals (per-resource color, supply vs. non-supply styling). Bubble visuals (label, output resource indicator, missing-requirement badge placeholder, recipe-variant dropdown affordance). Feeder visuals (thinner/distinct stroke from rails). Shared screen↔world coordinate transform consumed by both rendering and hit-testing.
- **Scope:** Rendering and viewport only — driven by store state but no editing gestures. Bubbles and rails are rendered from mock/hardcoded store data to validate visuals. Feeder rendering driven by whatever the feeders slot contains (may be empty at this stage).
- **Acceptance Criteria:** Hardcoded bubble + rail data renders correctly in SVG. Pan/zoom works (mouse wheel zoom, drag-to-pan). Supply vs. non-supply rails are visually distinct. Missing-requirement badge renders when flag is set. Screen↔world transform is accessible by other subsystems.
- **Dependencies:** TASK-002
- **Execution:** Sequential — must follow TASK-002

#### TASK-005: Solver — Feeder Derivation & Reactivity
- **Model:** Sonnet
- **Description:** Pure solver function: given bubbles + rails + recipe data, derive all feeders and missing-requirement flags. Nearest-source resolution (supply-enabled rails by nearest point on polyline segment; matching non-private bubble outputs by output port; orthogonal/Manhattan distance). Orthogonal L/Z feeder routing from bubble input port to chosen source point. Single recompute pass triggered by any authored-geometry mutation. Writes results into the store's feeders slot.
- **Scope:** Solver logic and reactivity wiring to the store mutations from TASK-002. Operates purely in world coordinates (bubbles/rails are stored in world space) — does NOT consume the screen↔world transform, which is only needed for screen-input hit-testing (TASK-006). No collision avoidance — feeders may cross anything. Degenerate L/Z cases (source directly adjacent) collapse to a straight segment.
- **Acceptance Criteria:** A canvas with one supply rail + one bubble whose recipe requires that resource type produces a feeder connecting them. Toggling rail supply off removes the feeder and marks the input missing. Moving a bubble re-routes its feeders. Two bubbles with no matching source both show missing-requirement badges.
- **Dependencies:** TASK-002, TASK-003
- **Execution:** Parallel with TASK-004 — both depend on TASK-002 (TASK-005 also on TASK-003); solver is pure world-space math and needs no renderer or transform. Verifying solver output visually requires TASK-004, but the two tasks have disjoint file scope (`solver/` vs. `scene/` rendering) and can be built concurrently.

#### TASK-006: Editing Interactions & Recipe Authoring UI
- **Model:** Sonnet
- **Description:** All direct manipulation and authoring UI. (a) Editing gestures: click-to-place bubble with palette/product selector, draw-rail tool mode (typed polyline), drag bubble, rail endpoint extend/bend, rail T-fork with parametric `{parentRailId, t}` origin that slides when parent reshapes, supply/private toggles. (b) Recipe authoring: per-bubble recipe-variant dropdown, product/recipe editor (name + input list) that writes into the user-set store, palette includes user-authored products. (c) Persistence: JSON import/export file UI, localStorage autosave wired to store.
- **Scope:** All interactive editing gestures, recipe editor UI, and persistence UI. Hit-testing reuses the screen↔world transform from TASK-004. Feeders are never selectable/attachable — enforce the authored/derived boundary in all hit-test paths.
- **Acceptance Criteria:** Full success-criteria flow works end-to-end: place bubbles, draw rails, watch feeders auto-connect, drag bubble to re-route, fork a rail and verify origin slides on parent reshape, toggle supply off to trigger missing-state, author a new product + recipe and place it as a bubble, export JSON, reload from localStorage.
- **Dependencies:** TASK-004, TASK-005, TASK-003
- **Execution:** Sequential — must follow TASK-004 and TASK-005

### Architecture Notes

- The authored/derived boundary is enforced at the store level: only `Bubble` and `Rail` mutations exist; `Feeder` is write-only from the solver and read-only for rendering. Hit-testing in TASK-006 must skip feeder SVG elements entirely.
- The screen↔world coordinate transform is defined once in the viewport (TASK-004) and imported by hit-testing (TASK-006) — a shared utility, not duplicated. The solver (TASK-005) does NOT need it: it operates entirely in world coordinates.
- Parametric fork origins (`{parentRailId, t}`) are resolved to world coordinates at render/solver time, not stored as pixel coords — this keeps fork positions correct after any parent reshape.
- The user recipe set is persisted separately from diagram JSON (shared cross-diagram store), so custom products survive diagram import/export without embedding the full user catalog in every export.
- Solver recompute is a full pass (not incremental) — acceptable for v1 canvas sizes; no memoization needed unless profiling reveals a problem.

### Dependency Graph

```
TASK-001 (scaffold)
   ├─→ TASK-002 (types & store) ─┬─→ TASK-004 (rendering & viewport) ─┐
   │                             └─→ TASK-005 (solver) ──────────────┤→ TASK-006 (editing & UI)
   └─→ TASK-003 (recipes) ─────────→ TASK-005 (solver) ──────────────┘
```

- TASK-004 depends on TASK-002.
- TASK-005 depends on TASK-002 and TASK-003.
- TASK-006 depends on TASK-003, TASK-004, and TASK-005.

Parallel opportunities:
- After TASK-001: TASK-002 and TASK-003 run simultaneously.
- After TASK-002 (and TASK-003 for the solver): TASK-004 and TASK-005 run simultaneously — disjoint file scope (`scene/` rendering vs. `solver/`), no data dependency (the feeders-slot contract is owned by TASK-002).
