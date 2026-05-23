# Feature Log: Recipes

*Tracks planned features, open bugs, and completed work for the recipes subsystem.*

## Data Schema & Bundled Set

- [x] (planned: 2026-05-23, completed: 2026-05-23) Define recipe schema: `{ product, variantId, label, inputs: string[], isDefault }`; resource types by name only, no quantities.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Author bundled recipe JSON covering core Factorio intermediates — 29 variants from raw resources through rocket components (circuits, plates, steel, plastic, gears, etc.) with default variants.

## User Authoring Layer

- [x] (planned: 2026-05-23, completed: 2026-05-23) Implement merge: user set (new products + new recipe variants) layered on top of the bundled set, keyed by product+variantId.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Author a brand-new product with its recipe (name + input resource types); empty inputs = raw/leaf resource. New resource names referenced in recipes become available as rail/source types.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Persist the user set in a shared cross-diagram store. — decision: `zustand/middleware/persist` to localStorage; user products/recipes survive reload and are reusable across diagrams.

## Variant Selection & Editor

- [x] (planned: 2026-05-23, completed: 2026-05-23) Per-bubble recipe dropdown (bubble context menu): switch variant updates inputs and triggers solver recompute.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Recipe/product editor UI: create or edit a product and its recipe variants. — decision: mounted at App level, opened via the "Recipes" toolbar button (new products) and the bubble context-menu "Edit Recipe…" (existing product); state held transiently in the editing store.
- [x] (planned: 2026-05-23, completed: 2026-05-23) Palette (ProductPicker) reflects user-authored products via `getAllProductIds()`, so new products are placeable as bubbles.
