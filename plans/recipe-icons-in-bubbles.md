# Recipe Icons in Bubbles

## Feature Requirements

### What We're Building

Replace the truncated recipe-name text currently rendered inside each bubble with the Factorio icon for the recipe's **primary product**. Long names like "Ammonia Rocket Fuel" no longer overflow or get ellipsized — the bubble instead shows a recognizable game icon (e.g. the rocket-fuel sprite), and the recipe name surfaces as a native browser tooltip on hover.

Icons are sourced from FactorioLab's pre-built sprite sheet — the same upstream that already provides our recipe catalog (`https://raw.githubusercontent.com/factoriolab/factoriolab/main/src/data/spa/...`). The icon-extraction step is added to the existing `scripts/generate-bundled-recipes.mjs` generator so icons and recipe data stay in sync forever and are bundled into the project (no runtime fetches). Bubbles grow to a size that displays the icon at its native crisp resolution rather than scaling down.

This is a readability and recognition win: Factorio players recognize icons faster than they read text, and the current text approach silently fails on long names.

### Goals

- Replace in-bubble recipe-name text with the primary-product icon for every bubble that has a `recipeId`.
- Bundle FactorioLab's sprite sheet (and the per-item sprite-sheet coordinates) into the project at build time via the existing recipe generator script.
- Show the recipe name as a native `title` tooltip on bubble hover — no custom styled tooltip.
- Grow bubbles to render icons at a clean, crisp size (no downscaling that blurs the sprite).

### Success Criteria

- Every bubble with a recipe shows the correct primary-product Factorio icon inside the circle.
- Hovering a bubble surfaces the recipe name via the browser's native tooltip after the default delay.
- Running `node scripts/generate-bundled-recipes.mjs` produces both the recipe catalog and the icon sprite sheet + coordinate map; the app loads everything offline with no network calls.
- Adding a new bubble (toolbar +Bubble, double-click quick-add, drag-from-missing-input) renders an icon, not text.
- Bubbles look visually consistent at the new size — input/output pills, hit-test radii, drag handles, and the output-port dot all still align correctly.
- No regression in the output-pill rendering — secondary outputs continue to render as text pills around the bubble.

### Constraints & Non-Goals

- **One icon per bubble.** Only the primary product's icon is shown. Secondary outputs stay as text pills around the bubble — no icons on the pills.
- **No custom tooltip.** Native browser `title` only. Styling, instant-display, multi-line, etc. are out of scope.
- **No runtime fetching.** Sprite sheet ships with the build. No fallback to remote URLs.
- **No icon-override authoring UI.** User cannot pick a different icon per bubble.
- **Recipes-only.** Bubbles without a `recipeId` (if such a state can exist) are out of scope for this plan — fall back to current behavior.
- **No icon on rails, output connectors, or feeders.** Bus/rail rendering is untouched.
- **No sprite-sheet trimming/subsetting.** Ship FactorioLab's sheet as-is, even if some sprites are unused.

### Assumptions

- FactorioLab's `data.json` (already consumed by the generator) contains, for each item, an `icon` field naming a sprite plus position fields (or similar) referencing a sprite sheet image (commonly `icons.webp` or `icons.png`) sibling to the data file in their repo.
- Recipes in the upstream data identify their products by item id; the existing generator already preserves enough of this to pick a "primary product" (it already does — the recipe-centric refactor uses it).
- The sprite sheet is small enough to bundle directly (low MB range) — acceptable for an offline tool.
- Native `title` tooltips render correctly on SVG `<image>` or HTML elements layered into the canvas; the React-SVG canvas in `BubbleLayer.tsx` can accept a `<title>` child for this.
- Bubbles are currently rendered as SVG `<circle>` elements inside the SVG canvas (`BubbleLayer.tsx`).
- Growing the bubble radius will not break any solver assumptions — bubble size already participates in port-position math via `geometry.ts`; updating one constant should cascade correctly through inputs/outputs/hit-tests/feeder endpoints.

### Open Questions

- **Render technique inside SVG:** SVG `<image href="data:..."/>` per bubble with a `clipPath` circle vs. an embedded sprite-sheet image referenced via SVG `<use>`/`<pattern>` vs. an HTML overlay layer positioned over the canvas. Tradeoffs: file size (data URIs blow up), DOM weight (one big sheet referenced many times is leaner), zoom crispness, and how `title` tooltips render in each. Architect to pick.
- **Bubble size:** Factorio icons are 64×64 native. The current bubble looks ~50px diameter. New diameter likely ~72–80px so the icon sits inside with a small ring of padding. Architect to specify exact dimensions and verify input/output pill placement (`geometry.ts`) still reads cleanly at the new size.
- **Sprite-sheet format & path:** Likely `src/recipes/icons.webp` (or `.png`) with a paired `iconAtlas.json` mapping `itemId → {x, y, w, h}`. Generator writes both. Architect to confirm and decide whether to inline atlas into `bundled.json` or keep it as a separate file.
- **What if a primary product has no icon in the upstream data?** Fallback: show a placeholder glyph? Render the old text? Architect to decide; suspect this is rare-to-never in practice for Space Age data.
- **Existing tests/typecheck impact:** Generator script gains a fetch + binary write; `bundled.json` schema gains icon coordinates; `BubbleLayer.tsx` rendering changes. Architect to scope the touched files and confirm no broader subsystem ripples.

---

## Development Plan

### Overview

Extend the recipe generator to bundle FactorioLab's icon sprite sheet and a per-item coordinate atlas alongside the existing recipe catalog, then replace the truncated text label inside each bubble with an SVG `<image>` clipped to the circle, sourced from the bundled sprite sheet. Bubble radius grows from 36 to 40 px so a 64×64 Factorio icon fits cleanly with a small padding ring; all geometry consumers (`bubbleInputBox`, hit-test) cascade from the single `BUBBLE_RADIUS` constant.

### Task Breakdown

#### TASK-001: Extend generator to fetch and write icon assets
- **Model:** Sonnet
- **Description:** Adds two outputs to `scripts/generate-bundled-recipes.mjs`: (1) `src/recipes/icons.webp` — FactorioLab's pre-built sprite sheet downloaded as a binary file, and (2) `src/recipes/iconAtlas.json` — a `Record<itemId, { x: number; y: number; w: number; h: number }>` map built from the `icon` / `iconPos` fields on each item in FactorioLab's `data.json`. The sprite sheet URL is `https://raw.githubusercontent.com/factoriolab/factoriolab/main/src/data/spa/icons.webp` (sibling to `data.json`). If an item has no icon position data, the entry is omitted silently.
- **Scope:** Only `scripts/generate-bundled-recipes.mjs`. Does not touch `bundled.json` schema, source types, or any React component. Does not inline atlas data into `bundled.json` — it stays a separate file so the atlas can be loaded independently without parsing the full recipe catalog.
- **Acceptance Criteria:**
  - Running `node scripts/generate-bundled-recipes.mjs` produces `src/recipes/icons.webp` and `src/recipes/iconAtlas.json` alongside the existing `src/recipes/bundled.json`.
  - `iconAtlas.json` is valid JSON with at least one entry per common item (e.g. `"iron-plate"`, `"copper-plate"`, `"electronic-circuit"`).
  - The script still writes `bundled.json` identically to its current output — no regression.
  - The script exits non-zero and prints a useful message if the sprite sheet fetch fails.
- **Dependencies:** None
- **Execution:** Parallel — no dependencies

#### TASK-002: Add `iconAtlas` to the recipe store and `Recipe` type
- **Model:** Haiku
- **Description:** Creates a new module `src/recipes/iconAtlas.ts` that statically imports `iconAtlas.json`, exports a typed `IconAtlas` (`Record<string, { x: number; y: number; w: number; h: number }>`), and exports a pure `getIconCoords(itemId: string): IconAtlasEntry | undefined` lookup function. Also exports the bundled sprite-sheet URL via Vite's `?url` asset import (e.g. `import iconsUrl from './icons.webp?url'`) so consumers reference a single canonical source. Does NOT add the lookup to the Zustand `useRecipeStore` — the atlas is static, stateless data and does not belong in the persisted store.
- **Scope:** New file `src/recipes/iconAtlas.ts`. Optionally re-exported from `src/recipes/index.ts` if other exports are surfaced there. Does not touch `store.ts`, `BubbleLayer.tsx`, `geometry.ts`, or any scene file.
- **Acceptance Criteria:**
  - `getIconCoords('iron-plate')` returns `{ x, y, w, h }` when called from any module.
  - `iconsUrl` resolves to a valid bundled asset URL at runtime (verifiable via `console.log` or a smoke render).
  - TypeScript compiles without errors on the changed files.
  - The atlas import is a static JSON import (not a runtime fetch) so it works offline.
- **Dependencies:** TASK-001 (atlas file must exist before the import is valid)
- **Execution:** Sequential — must follow TASK-001

#### TASK-003: Grow bubble radius and verify geometry cascade
- **Model:** Haiku
- **Description:** Changes `BUBBLE_RADIUS` in `src/scene/geometry.ts` from `36` to `40`. Verifies (by reading call sites) that `bubbleInputBox`, `bubbleOutputPort`, and the hit-test radius check in `src/editing/hitTest.ts` all reference the constant rather than a hardcoded literal, confirming the change cascades automatically. No other files need editing.
- **Scope:** `src/scene/geometry.ts` only (single constant change). Explicitly excludes any change to input box sizing constants (`INPUT_BOX_BASE_WIDTH`, etc.) — tab geometry is untouched.
- **Acceptance Criteria:**
  - `BUBBLE_RADIUS` is `40` in `geometry.ts`.
  - A grep of the codebase finds no other hardcoded `36` used as a bubble radius literal.
  - TypeScript compiles without errors.
- **Dependencies:** None
- **Execution:** Parallel — independent of TASK-001 and TASK-002

#### TASK-004: Replace in-bubble text label with sprite icon in `BubbleLayer.tsx`
- **Model:** Sonnet
- **Description:** In `BubbleLayer.tsx`, replaces the `<text>` label element inside `BubbleNode` with an SVG `<image>` that renders the primary product's sprite from the bundled sheet. Uses a `<clipPath>` circle (radius = `BUBBLE_RADIUS - 4` for a 4 px padding ring) to clip the image to the bubble shape. The `<image>` href is a CSS `url()` import of `src/recipes/icons.webp` resolved via Vite's asset pipeline (or an imported URL string). Sprite position is applied via `x`/`y` offset on the `<image>` element using atlas coordinates from `getIconCoords(primaryProduct)`. Adds a `<title>` child to the wrapping `<g data-bubble-id>` element containing `label` so the browser renders a native tooltip on hover. If `getIconCoords` returns `undefined` for a given item, falls back to the existing truncated `<text>` label (no silent blank bubble).
- **Scope:** `src/components/BubbleLayer.tsx` only. Does not change `geometry.ts`, store files, or any other component. The `prettify` and `fitLabel` helpers are retained (still used by output tab labels and the fallback path).
- **Acceptance Criteria:**
  - Every bubble with a valid atlas entry shows a Factorio sprite inside the circle, not text.
  - Hovering a bubble shows the recipe name as a native browser tooltip.
  - Bubbles with no atlas entry still render the truncated text label (fallback is visible).
  - Output tab labels (the text inside the output pentagon tabs) are unchanged.
  - TypeScript compiles without errors; no `any` casts introduced.
- **Dependencies:** TASK-002 (atlas store selector), TASK-003 (updated radius for clip circle sizing)
- **Execution:** Sequential — must follow TASK-002 and TASK-003

### Architecture Notes

- **Sprite rendering technique:** A single `<image>` element per bubble referencing the shared sprite sheet URL, offset so the correct sprite frame is centered in the clip circle. This is far lighter than per-bubble data URIs and avoids the complexity of SVG `<pattern>` or `<use>` indirection. Vite handles the asset URL at build time; the file ships as a static asset.
- **Atlas as a separate file:** Keeping `iconAtlas.json` separate from `bundled.json` means future changes to either file don't require regenerating the other. The store loads both at startup; neither is fetched at runtime.
- **Radius cascade:** `BUBBLE_RADIUS = 40` is the single source of truth. `bubbleInputBox` computes `innerX` as `center.x ± BUBBLE_RADIUS + INPUT_BOX_LEAD`, so the tab attachment point shifts outward automatically. Hit-test uses `BUBBLE_RADIUS * BUBBLE_RADIUS` directly. No manual ripple needed.
- **Fallback strategy:** An `undefined` atlas entry (raw/leaf recipes, curated flat variants) falls back to the existing `<text>` label rather than a blank circle. This is safe because raw leaves are rarely placed as bubbles but must not crash.
- **`<title>` tooltip placement:** The SVG `<title>` must be the first child of its containing `<g>` to be reliably picked up by browsers on the group's bounding box. Place it before the `<circle>` and `<image>` elements.

### Dependency Graph

```
TASK-001 (generator: fetch + write atlas + sheet) ──┐
                                                      ├─→ TASK-004 (BubbleLayer: icon rendering)
TASK-002 (store: load atlas, getIconCoords) ─────────┤
                                                      │
TASK-003 (geometry: BUBBLE_RADIUS 36→40) ────────────┘
```
