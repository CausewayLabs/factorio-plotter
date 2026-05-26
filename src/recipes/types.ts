// ============================================================
// Recipe subsystem types
// ============================================================

/**
 * A recipe is a first-class entity describing one production process.
 * It has inputs and products of equal weight — there is no "main product."
 * Raw/leaf resources are recipes with empty inputs[] and a single-element products[].
 * The primary product (for color/label anchoring) is products[0] by convention.
 */
export interface Recipe {
  /** Kebab-case identifier derived from the recipe label (e.g. "iron-plate-smelting") */
  id: string
  /** Human-readable label shown in the UI */
  label: string
  /** Named resource types this recipe consumes. Empty = raw/leaf resource. */
  inputs: string[]
  /** Named resource types this recipe produces. At least one. products[0] is the primary product. */
  products: string[]
}

/**
 * The full recipe map after merging bundled + user sets.
 * Keyed by recipe id (flat — not nested by product).
 */
export type RecipeMap = Record<string, Recipe>

/**
 * The user-authored recipe set (persisted cross-diagram to localStorage).
 * Contains new recipes and additional recipes for existing products.
 */
export interface UserRecipeSet {
  recipes: Recipe[]
}
