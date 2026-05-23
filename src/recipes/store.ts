import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import bundledData from './bundled.json'
import type { RecipeCatalog, RecipeVariant, UserRecipeSet } from './types'

// ============================================================
// Build the bundled catalog from JSON
// ============================================================

function buildCatalog(variants: RecipeVariant[]): RecipeCatalog {
  const catalog: RecipeCatalog = {}
  for (const v of variants) {
    if (!catalog[v.product]) {
      catalog[v.product] = {}
    }
    catalog[v.product][v.variantId] = v
  }
  return catalog
}

const BUNDLED_VARIANTS: RecipeVariant[] = bundledData as RecipeVariant[]
const BUNDLED_CATALOG: RecipeCatalog = buildCatalog(BUNDLED_VARIANTS)

// ============================================================
// User recipe store (persisted to localStorage)
// ============================================================

export interface RecipeStore {
  /** User-authored variants. Shared across all diagrams. */
  userVariants: RecipeVariant[]

  /** Add or replace a recipe variant. If the product+variantId already exists, it is overwritten. */
  upsertVariant: (variant: RecipeVariant) => void

  /** Remove a user-authored variant */
  removeVariant: (product: string, variantId: string) => void

  // --- Derived selectors (computed, not stored) ---

  /** Returns the merged catalog (bundled + user set) */
  getMergedCatalog: () => RecipeCatalog

  /**
   * Resolve the active recipe for a given product + optional variantId.
   * Falls back to the default variant if variantId is null/missing.
   * Returns null if the product is not in the catalog at all.
   */
  resolveRecipe: (product: string, variantId: string | null) => RecipeVariant | null

  /**
   * Get all variants for a product (merged), sorted with default first.
   * Returns empty array if product is unknown.
   */
  getVariantsForProduct: (product: string) => RecipeVariant[]

  /**
   * Get all known product IDs across bundled + user set.
   */
  getAllProductIds: () => string[]
}

const STORAGE_KEY = 'factorio-plotter-user-recipes'

export const useRecipeStore = create<RecipeStore>()(
  persist(
    (set, get) => ({
      userVariants: [],

      upsertVariant(variant) {
        set(state => {
          // Remove existing variant with same product+variantId if present
          const filtered = state.userVariants.filter(
            v => !(v.product === variant.product && v.variantId === variant.variantId)
          )
          return { userVariants: [...filtered, variant] }
        })
      },

      removeVariant(product, variantId) {
        set(state => ({
          userVariants: state.userVariants.filter(
            v => !(v.product === product && v.variantId === variantId)
          ),
        }))
      },

      getMergedCatalog() {
        const { userVariants } = get()
        // Start with a deep-ish copy of bundled catalog
        const merged: RecipeCatalog = {}
        for (const [product, variants] of Object.entries(BUNDLED_CATALOG)) {
          merged[product] = { ...variants }
        }
        // Merge user variants on top (they can add products or add/override variants)
        for (const v of userVariants) {
          if (!merged[v.product]) {
            merged[v.product] = {}
          }
          merged[v.product][v.variantId] = v
        }
        return merged
      },

      resolveRecipe(product, variantId) {
        const catalog = get().getMergedCatalog()
        const productVariants = catalog[product]
        if (!productVariants) return null

        if (variantId && productVariants[variantId]) {
          return productVariants[variantId]
        }

        // Fall back to default variant
        const defaultVariant = Object.values(productVariants).find(v => v.isDefault)
        if (defaultVariant) return defaultVariant

        // Fall back to first variant
        const first = Object.values(productVariants)[0]
        return first ?? null
      },

      getVariantsForProduct(product) {
        const catalog = get().getMergedCatalog()
        const productVariants = catalog[product]
        if (!productVariants) return []
        const variants = Object.values(productVariants)
        // Sort: default first, then alphabetically by variantId
        return variants.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1
          if (!a.isDefault && b.isDefault) return 1
          return a.variantId.localeCompare(b.variantId)
        })
      },

      getAllProductIds() {
        const catalog = get().getMergedCatalog()
        return Object.keys(catalog).sort()
      },
    }),
    {
      name: STORAGE_KEY,
      // Only persist the user-authored variants, not the computed/bundled data
      partialize: (state): UserRecipeSet => ({
        variants: state.userVariants,
      }),
      // Rehydrate: map the persisted shape back to store shape
      merge: (persisted, current) => {
        const p = persisted as UserRecipeSet
        return {
          ...current,
          userVariants: p?.variants ?? [],
        }
      },
    }
  )
)

// ============================================================
// Convenience: read bundled catalog without store
// ============================================================

export function getBundledCatalog(): RecipeCatalog {
  return BUNDLED_CATALOG
}

export function getBundledVariants(): RecipeVariant[] {
  return BUNDLED_VARIANTS
}
