// ============================================================
// Recipe subsystem types
// ============================================================

/**
 * A recipe variant defines one way to make a product.
 * Products may have multiple variants (e.g. "green circuit" with or without copper-wire step).
 * A product with empty inputs[] is a raw/leaf resource — nothing feeds it.
 */
export interface RecipeVariant {
  /** The product this recipe produces */
  product: string
  /** Unique identifier for this variant within the product (e.g. "default", "flat") */
  variantId: string
  /** Human-readable label shown in dropdowns */
  label: string
  /** Named resource types this recipe consumes. Empty = raw/leaf resource. */
  inputs: string[]
  /** Whether this is the default variant when no explicit choice is made */
  isDefault: boolean
}

/**
 * The full recipe catalog after merging bundled + user sets.
 * Keyed by product, then by variantId.
 */
export type RecipeCatalog = Record<string, Record<string, RecipeVariant>>

/**
 * The user-authored recipe set (persisted cross-diagram to localStorage).
 * Contains new products and additional variants for existing products.
 */
export interface UserRecipeSet {
  variants: RecipeVariant[]
}
