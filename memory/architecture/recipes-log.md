# Feature Log: Recipes

*Tracks planned features, open bugs, and completed work for the recipes subsystem.*

## Data Schema & Bundled Set

- [ ] (planned: 2026-05-23) Define recipe schema: `{ product, variantId, label, inputs: string[], isDefault }`; resource types by name only, no quantities.
- [ ] (planned: 2026-05-23) Author bundled recipe JSON covering core Factorio intermediates (circuits, plates, steel, plastic, gears, common products) with sensible default variants.

## User Authoring Layer

- [ ] (planned: 2026-05-23) Implement merge: user set (new products + new recipe variants) layered on top of the bundled set, keyed by product+variantId.
- [ ] (planned: 2026-05-23) Author a brand-new product with its recipe (name + input resource types); empty inputs = raw/base resource (leaf). New resource names referenced in recipes become available as rail/source types.
- [ ] (planned: 2026-05-23) Persist the user set (products + recipes) in a shared user store so it survives reloads and is reusable across diagrams.

## Variant Selection & Editor

- [ ] (planned: 2026-05-23) Per-bubble recipe dropdown: list all variants for the product, switch updates the bubble's inputs and triggers solver recompute.
- [ ] (planned: 2026-05-23) Recipe/product editor UI: create or edit a product and any of its recipe variants (name, product, input list) — saved into the user set and surfaced in the palette + dropdown.
- [ ] (planned: 2026-05-23) Palette reflects user-authored products so new products are placeable as bubbles.
