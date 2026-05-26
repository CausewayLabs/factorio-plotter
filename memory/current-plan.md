# Current Plan

*Active plan written by `/next-plan`. Overwritten each time `/next-plan` runs. Check off steps as you complete them. Create a handoff doc in `memory/handoffs/` only if work genuinely gets stuck mid-plan — most plans should resume from this file + recent git activity without ceremony.*

## Plan: Drag-from-missing-input → create producer bubble

**Why:** A bubble with an unsatisfied input currently shows only a missing-requirement flag. Letting the user drag *from* that input to empty canvas and drop a new bubble pre-wired to a recipe that produces the needed product turns the missing-requirement signal into the primary authoring gesture for backfilling upstream production. Mirror of the existing output-emit-drag, reversed.

**Model (locked):**
- Drag originates at an **unsatisfied** input port (`InputSlot.satisfied === false`). Satisfied inputs stay drag-inert (they already have a feeder).
- Live preview = direct line from input port to cursor (matches the eventual feeder visual).
- Drop on **empty canvas** → resolve a recipe producing the needed product, create bubble at drop point, leave its outputs **unbound** (Option 2). Solver picks up the new bubble as a feeder source via the existing bubble-output-as-source path; the original consumer's missing-requirement flag clears automatically.
- Drop on existing bubble / existing rail → out of scope for this plan.

**Recipe selection:**
Need a `recipesByProduct: Map<productId, Recipe[]>` index in `src/recipes/`. When multiple recipes produce the product, pick deterministically (first by id sort) for v1; disambiguation UI is a follow-up.

### Steps

- [x] **1. Recipe index.** Already present as `useRecipeStore.getRecipesForProduct(productId)` (store.ts:103) — primary-product-first then id-sorted. No new code needed.
- [x] **2. Input-port hit testing.** Added `hitTestUnsatisfiedInputTab` in `editing/hitTest.ts` — mirrors `hitTestBubbleOutputTab` but filters `slot.satisfied === false`.
- [x] **3. Drag gesture in `Canvas.tsx`.** Added `inputFillDrag` ref mirroring `outputDrag`; mousedown after output-tab check, mousemove updates `endWorld`, dashed straight-line preview from port→cursor, crosshair cursor while dragging, hover affordance on unsatisfied tabs.
- [x] **4. Drop handler.** Mouseup picks first recipe from `getRecipesForProduct(resourceType)`, builds `outputBindings` with all-null per product, `addBubble({ position: dropPoint, recipeId, ... })`, autosaves. Outputs stay unbound — solver wires consumer via existing bubble-as-feeder-source path.
- [x] **5. No-recipe fallback.** Empty recipes array → drop is a no-op (silent). Hint deferred.
- [x] **6. Typecheck.** `npx tsc --noEmit` passes. Manual in-app smoke still pending.

### Decisions

- **Output binding = Option 2 (unbound).** New bubble's outputs stay null; solver wires the consumer via bubble-output feeder. No auto-bind to nearby bus. Consistent with existing bubble↔bubble feeder behavior; user can always emit-drag later to put the product onto a bus.
- **Multi-producer recipes:** first by sorted id for v1. Disambiguation UI deferred.

### Open (non-blocking)

- Visual affordance on unsatisfied inputs (dashed/pulsing tab) to advertise the gesture — likely a follow-up plan, not in scope here.
