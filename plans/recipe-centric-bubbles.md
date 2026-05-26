# Recipe-Centric Bubbles

## Feature Requirements

### What We're Building

Refactor the recipes subsystem and bubble model from **product-centric** to **recipe-centric**. Today a recipe variant is identified by `(product, variantId)` and a bubble points at a product + chooses which variant produces it. This shape can't represent recipes with multiple outputs (ammonia → ammonia + ice, advanced oil processing, scrap recycling, Kovarex, etc.) without bolting on a "co-product" concept that privileges one output over the others.

The new model makes recipes first-class. A **recipe** has `inputs[]` and `products[]` of equal weight — there is no "main product." A **bubble** selects a recipe (not a product), displays the recipe's name, and exposes every product in `products[]` as an independently-bindable output slot, each of which can be wired to a different bus (or left unbound). **Rails remain product-typed** — a bus lane still carries exactly one product, and binding a bubble output to a bus joins that specific product to the bus.

The bubble placement filter searches **both recipe names and product names**, because players overwhelmingly think in terms of "I want ammonia" rather than "I want the ammonia-from-natural-gas recipe." A search for "iron plate" surfaces every recipe that produces iron plate (smelting, casting, recycling variants) as separate pickable results, sorted with default recipes first.

### Goals

- Represent multi-output recipes natively, without privileging one output.
- Keep the equal-weight framing visible in the data model — `products[]` is a flat array, not `{ primary, coProducts }`.
- Let players bind each output of a bubble to a different bus, or leave outputs unbound.
- Preserve product-first discovery: filtering by product name remains the dominant UX.
- Maintain the charter invariant: authored geometry persistent, derived geometry (feeders + output connectors) recomputed and non-attachable.

### Success Criteria

- A user can place a bubble for "Ammonia" recipe and bind ammonia to one bus and ice to another (or only one of the two).
- Searching the bubble picker for "ice" returns the ammonia recipe (because ice is one of its products) alongside any other ice-producing recipes.
- Searching for a recipe name returns that recipe directly.
- Default recipes for each product appear first in the filtered picker.
- Existing saved diagrams (which reference `productId + variantId`) load successfully, with each bubble resolved to its corresponding recipe id.
- Bubble color is deterministic — derived from the recipe's **primary product**, which is the first entry in `products[]` (matching FactorioLab's data order).
- Solver source-search treats a bubble as a valid source for every one of its bound outputs.
- For known-ambiguous recipes (advanced oil processing, coal liquefaction, scrap recycling, Kovarex enrichment), the first-listed product determines bubble color; this is acceptable as a default and can be revisited later if it causes friction.

### Constraints & Non-Goals

- **No changes to rail authoring.** Rails are still single-product per lane, drawn and forked as today.
- **No changes to feeder routing or orthogonal layout.** The solver gains additional source candidates per bubble; routing logic is unchanged.
- **No changes to the persistence file format** beyond renaming the bubble's `(productId, variantId)` reference to a single `recipeId`. JSON import/export stays human-readable.
- **No changes to the bundled-recipe generator script in this plan.** The script currently emits one product per recipe; updating it to emit `products[]` arrays from FactorioLab source data is a follow-up. This refactor must work end-to-end on the existing bundled data (every recipe will simply have a single-element `products[]`) before the generator is enhanced.
- **No "primary product" field stored on the recipe.** Primary = `products[0]`. This keeps the equal-weight framing honest.
- **No per-bubble override of primary product / color.** If a player cares deeply about the bubble color for an ambiguous recipe, the workaround is to reorder the recipe's `products[]` in a custom user recipe.
- **No changes to the recipe editor's input-side authoring flow.** The ingredient autocomplete and "Create <name>" escape behave exactly as today, just mirrored to the products side as well.

### Assumptions

- Recipe ids are **readable kebab-case** derived from labels (option (a) from brainstorm). Renaming a recipe is a deliberate breaking-change to references, same as renaming a product today.
- Every recipe — including raw resources — fits the new shape. Raw resources are recipes with empty `inputs[]` and a single-element `products[]`.
- A bubble whose recipe has N products renders N output binding slots. Unbound outputs simply don't emit; downstream bubbles needing that product won't see this bubble as a source for the unbound output.
- The filter picker shows recipes as flat pickable rows (not grouped by product). A row that matches via a product is visually tagged so the player understands why it appeared.
- Migration of existing saved diagrams: each historical `(productId, variantId)` maps deterministically to a recipe id under the new scheme. Where the mapping is unclear (e.g. a variant the new dataset has restructured), fall back to the default recipe for that product.
- The custom user recipe set (`UserRecipeSet`) restructures to store recipes directly (with `inputs[]` and `products[]`), not variants attached to products.

---

## Development Plan

### Overview

Refactor the recipe data model from product-centric (`RecipeVariant` keyed by `(product, variantId)`) to recipe-centric (`Recipe` keyed by `recipeId`) and update every subsystem — types, stores, solver, persistence, and UI — that touches that model. Each task owns a clean slice with no file overlap except at explicitly noted seams.

### Task Breakdown

#### TASK-001: Redefine Core Types
- **Model:** Sonnet
- **Description:** Replace `RecipeVariant` with a new `Recipe` interface; replace `RecipeCatalog` (keyed by product) with a flat `RecipeMap` (keyed by `recipeId`); update `Bubble` to replace `productId` + `recipeVariantId` with `recipeId` and an `outputBindings: Record<string, string | null>` map (product → railId or null).
- **Scope:** `src/recipes/types.ts` and `src/scene/types.ts` only. No logic changes — types only. `OutputConnector.resourceType` remains; its source shifts from `bubble.productId` to the specific bound product, but the field itself is unchanged.
- **Acceptance Criteria:** Both files compile with zero errors. `Recipe` has `id: string`, `label: string`, `inputs: string[]`, `products: string[]`. `Bubble` has `recipeId: string`, `outputBindings: Record<string, string | null>`. Old `productId`, `recipeVariantId`, `variantId`, `isDefault` fields are gone from both files.
- **Dependencies:** None
- **Execution:** Parallel — no dependencies

#### TASK-002: Migrate Recipe Data Store
- **Model:** Sonnet
- **Description:** Rewrite `src/recipes/store.ts` and `src/recipes/normalize.ts` to operate on the new `Recipe` / `RecipeMap` types. Replace `buildCatalog` with a flat `buildRecipeMap`. Add `getAllRecipes()`, `getRecipeById(id)`, `getAllProductIds()` (derived by collecting all `products[]` entries across all recipes, deduplicated), `getRecipesForProduct(productId)` (flat array of matching recipes), `resolveRecipe(recipeId)`. Replace `UserRecipeSet` storage shape. Migrate `bundled.json` — each current variant becomes a recipe with a single-element `products[]` and a kebab-case `id` derived from `product + variantId`.
- **Scope:** `src/recipes/store.ts`, `src/recipes/normalize.ts`, `src/recipes/bundled.json`, `src/recipes/index.ts`. Does NOT touch scene, solver, or UI files.
- **Acceptance Criteria:** `getAllProductIds()` returns the same set of product strings as before (since all current recipes have one product). `getRecipesForProduct('iron-plate')` returns all recipes whose `products[]` includes `'iron-plate'`, sorted with recipes where `products[0] === 'iron-plate'` first (canonical producers), then recipes where `'iron-plate'` appears later in `products[]`; within each group, bundled order is preserved. The first element of this result is therefore the default recipe for that product (no separate `getDefaultRecipeForProduct` helper needed, but callers may add a thin wrapper). `resolveRecipe(id)` round-trips correctly. TypeScript reports zero errors in this module.
- **Dependencies:** TASK-001
- **Execution:** Sequential — must follow TASK-001

#### TASK-003: Migrate Persistence Layer
- **Model:** Sonnet
- **Description:** Update `src/editing/persistence.ts` to read/write the new `Bubble` shape. Add a `normalizeBubble` migration path: an incoming bubble with `productId` + `recipeVariantId` is converted to `recipeId` (resolved via the recipe store's `getAllRecipes()` lookup — find the recipe whose single product matches `productId` and whose id suffix matches `variantId`, or fall back to the default recipe for that product). `outputBindings` backfills from the old single `outputTarget` field: `{ [productId]: outputTarget }`. The persisted JSON key for a bubble changes from `productId`/`recipeVariantId` to `recipeId`/`outputBindings`.
- **Scope:** `src/editing/persistence.ts` only.
- **Acceptance Criteria:** A diagram saved with the old shape loads without error. A diagram saved with the new shape round-trips cleanly. `normalizeBubble` unit test (manual) covers: old shape → new shape, new shape → passthrough, missing `outputTarget` → `{}` bindings.
- **Dependencies:** TASK-001, TASK-002
- **Execution:** Sequential — must follow TASK-002

#### TASK-004: Update Solver
- **Model:** Sonnet
- **Description:** Rewrite the output-connector and feeder-source logic in `src/solver/solver.ts` to work with the new bubble shape. A bubble now emits one output connector per entry in `outputBindings` where the value is non-null. `findNearestSource` receives a `resourceType` and searches bubbles whose recipe's `products[]` includes that type and whose `outputBindings[resourceType]` is null (unbound outputs are still valid feeder sources via direct bubble-to-bubble connection). `OutputConnector.resourceType` is set to the specific product key from `outputBindings`.
- **Scope:** `src/solver/solver.ts` only.
- **Acceptance Criteria:** A bubble with two bound outputs generates two `OutputConnector` entries (one per binding). A bubble with one unbound product is still discoverable as a feeder source for that product. TypeScript zero errors.
- **Dependencies:** TASK-001, TASK-002
- **Execution:** Parallel with TASK-003 — both depend on TASK-002, neither touches the other's files

#### TASK-005: Update Scene Store and Editing Actions
- **Model:** Sonnet
- **Description:** Update `src/scene/store.ts` and `src/editing/store.ts` to use the new `Bubble` shape. `addBubble` accepts `recipeId` (not `productId`). Output-binding actions replace the single `setOutputTarget(bubbleId, railId)` with `setOutputBinding(bubbleId, productId, railId | null)`. When a bubble is placed, `outputBindings` is initialized as `{}` for all products in the recipe. Rail's `resourceTypes` update: adding a binding adds the product to the rail; removing it removes the product (if no other bubble is bound to the same rail for that product).
- **Scope:** `src/scene/store.ts`, `src/editing/store.ts`. Does NOT touch UI components.
- **Acceptance Criteria:** `addBubble({ recipeId: 'iron-plate-smelting' })` creates a bubble with `outputBindings: { 'iron-plate': null }`. `setOutputBinding(bubbleId, 'iron-plate', railId)` sets `outputBindings['iron-plate'] = railId` and adds `'iron-plate'` to the rail's `resourceTypes`. TypeScript zero errors.
- **Dependencies:** TASK-001, TASK-002
- **Execution:** Parallel with TASK-003 and TASK-004 — all three depend only on TASK-002 and touch disjoint files (`src/scene/store.ts` + `src/editing/store.ts` vs. `src/editing/persistence.ts` vs. `src/solver/solver.ts`)

#### TASK-006: Update UI Components
- **Model:** Sonnet
- **Description:** Update all UI components to use the new model. (1) `ProductPicker` → rename to `RecipePicker` or adapt in-place: filter now calls `getRecipesForProduct(query)` + direct recipe-name match; each row shows the recipe label with a visual tag when matched via product. Default recipes (first recipe per product in the merged map) sort first. (2) `BubbleLayer`: bubble color derived from `recipe.products[0]` (primary product). Label shows `recipe.label`. Render one output slot per product in `recipe.products[]`. (3) `BubbleContextMenu`: output-binding UI shows one bind/unbind entry per product slot. (4) `RecipeEditor`: mirror the ingredient authoring flow to a products side — `products[]` array editable same way as `inputs[]`.
- **Scope:** `src/components/ProductPicker.tsx`, `src/components/BubbleLayer.tsx`, `src/components/BubbleContextMenu.tsx`, `src/components/RecipeEditor.tsx`. Does NOT touch store or solver files.
- **Acceptance Criteria:** Searching "ice" in the picker returns the ammonia recipe (tagged "via ice"). Searching "ammonia" returns the ammonia recipe. A placed ammonia bubble renders two output slots. Each slot has an independent bind/unbind action. Bubble color matches `products[0]`-derived hue. TypeScript zero errors across all four files.
- **Dependencies:** TASK-003, TASK-004, TASK-005
- **Execution:** Sequential — must follow TASK-003, TASK-004, and TASK-005 (UI exercises persistence load, solver-derived feeders, and the new scene/editing actions end-to-end)

### Architecture Notes

- **Primary-product convention:** `recipe.products[0]` is the color/label anchor. No field stores this — it is always read positionally. This is an invariant; do not introduce a `primaryProduct` field.
- **Output bindings vs. output target:** The old single `outputTarget: string | null` is replaced by `outputBindings: Record<string, string | null>` — one entry per product in the recipe. The solver loop that generated one `OutputConnector` per bubble now generates N per bubble (one per non-null binding).
- **`getAllProductIds()` derivation:** Collected by iterating all recipes and unioning their `products[]` arrays. This keeps the store as the single source of truth and avoids a redundant product registry.
- **Default-recipe ordering:** `getRecipesForProduct(productId)` returns recipes with `products[0] === productId` first (canonical producers), then other recipes where `productId` appears later in `products[]`. Within each group, preserve bundled order.
- **`isDefaultFor` answer:** No new field. "Default for product P" = the first recipe in `getRecipesForProduct(P)`. The sort rule above encodes this implicitly.

### Dependency Graph

```
TASK-001 (types) ─→ TASK-002 (recipe store) ─┬─→ TASK-003 (persistence) ─┐
                                              ├─→ TASK-004 (solver) ──────┼─→ TASK-006 (UI)
                                              └─→ TASK-005 (scene/edit) ──┘

TASK-003, TASK-004, TASK-005 run in parallel after TASK-002. TASK-006 waits on all three.
```

### Open Questions

- **Recipe id collisions.** If two recipes have label collisions after kebab-casing (unlikely in the curated set, possible with user-authored recipes), the second gets a numeric suffix (`-2`). Worth confirming this is acceptable rather than prompting the user.
- **Bubble label length.** Some recipe names are longer than product names (e.g. "Advanced oil processing" vs "Heavy oil"). Bubble label rendering may need a max-width / truncation pass, but this can defer to a follow-up if it's not visibly broken.
- **Recipe-picker UX for the four ambiguous recipes.** When a player searches "heavy oil," they'll get advanced oil processing, coal liquefaction, and basic oil processing all back. Sort order matters here; the architect should think about a tiebreaker beyond "default first" (e.g. simpler-recipe-first, or input-count ascending).
