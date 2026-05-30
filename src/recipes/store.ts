import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import bundledData from './bundled.json'
import type { Recipe, RecipeMap, UserRecipeSet } from './types'
import { prettify } from './labels'

// ============================================================
// Virtual "raw input" recipes
// ============================================================
//
// "Raw" is modeled as a recipe with empty inputs[] (charter: a product whose
// recipe is empty is a raw/base resource). The bundled catalog only carries raw
// recipes for true raw resources (ores, fluids, barrels). To let the user
// declare ANY product as externally-supplied — e.g. "I bring in holmium plates
// from off-diagram" — we synthesize a raw recipe on demand for any product that
// lacks one. The id convention `raw:<productId>` is self-describing and round-
// trips through persistence (getRecipeById re-synthesizes it on load).

const RAW_PREFIX = 'raw:'


/** Synthesize the virtual raw-input recipe for a product id. */
export function makeRawRecipe(productId: string): Recipe {
  return {
    id: RAW_PREFIX + productId,
    label: `${prettify(productId)} (raw)`,
    inputs: [],
    products: [productId],
  }
}

// ============================================================
// Build the bundled recipe map from JSON
// ============================================================

function buildRecipeMap(recipes: Recipe[]): RecipeMap {
  const map: RecipeMap = {}
  for (const r of recipes) {
    map[r.id] = r
  }
  return map
}

const BUNDLED_RECIPES: Recipe[] = bundledData as Recipe[]
const BUNDLED_MAP: RecipeMap = buildRecipeMap(BUNDLED_RECIPES)

// ============================================================
// User recipe store (persisted to localStorage)
// ============================================================

export interface RecipeStore {
  /** User-authored recipes. Shared across all diagrams. */
  userRecipes: Recipe[]

  /** Add or replace a recipe by id. */
  upsertRecipe: (recipe: Recipe) => void

  /** Remove a user-authored recipe by id. */
  removeRecipe: (id: string) => void

  // --- Derived selectors (computed, not stored) ---

  /** Returns the merged recipe map (bundled + user set, user overrides bundled on id collision). */
  getMergedMap: () => RecipeMap

  /** All recipes in the merged map as a flat array, in bundled order then user order. */
  getAllRecipes: () => Recipe[]

  /** Look up a single recipe by id. Returns null if not found. */
  getRecipeById: (id: string) => Recipe | null

  /**
   * All recipes whose products[] includes productId.
   * Sorted: recipes where products[0] === productId first (canonical/primary), then others.
   * The first element is the default recipe for that product.
   */
  getRecipesForProduct: (productId: string) => Recipe[]

  /**
   * All distinct product ids across the merged map (union of every recipe's products[]).
   * Sorted alphabetically.
   */
  getAllProductIds: () => string[]

  /**
   * Resolve a recipe by id. Alias for getRecipeById — provided so callers that
   * previously used resolveRecipe(product, variantId) have a clear migration target.
   */
  resolveRecipe: (id: string) => Recipe | null
}

const STORAGE_KEY = 'factorio-plotter-user-recipes'

export const useRecipeStore = create<RecipeStore>()(
  persist(
    (set, get) => ({
      userRecipes: [],

      upsertRecipe(recipe) {
        set(state => {
          const filtered = state.userRecipes.filter(r => r.id !== recipe.id)
          return { userRecipes: [...filtered, recipe] }
        })
      },

      removeRecipe(id) {
        set(state => ({
          userRecipes: state.userRecipes.filter(r => r.id !== id),
        }))
      },

      getMergedMap() {
        const { userRecipes } = get()
        const merged: RecipeMap = { ...BUNDLED_MAP }
        for (const r of userRecipes) {
          merged[r.id] = r
        }
        return merged
      },

      getAllRecipes() {
        return Object.values(get().getMergedMap())
      },

      getRecipeById(id) {
        const found = get().getMergedMap()[id]
        if (found) return found
        // Synthesize virtual raw recipes (raw:<productId>) not in the catalog.
        if (id.startsWith(RAW_PREFIX)) return makeRawRecipe(id.slice(RAW_PREFIX.length))
        return null
      },

      getRecipesForProduct(productId) {
        const all = Object.values(get().getMergedMap())
        const matching = all.filter(r => r.products.includes(productId))
        matching.sort((a, b) => {
          const aPrimary = a.products[0] === productId
          const bPrimary = b.products[0] === productId
          if (aPrimary && !bPrimary) return -1
          if (!aPrimary && bPrimary) return 1
          return a.id.localeCompare(b.id)
        })
        // Always offer a raw-input option: any product can be declared
        // externally-supplied. Skip if the catalog already has a raw recipe.
        if (!matching.some(r => r.inputs.length === 0)) {
          matching.push(makeRawRecipe(productId))
        }
        return matching
      },

      getAllProductIds() {
        const ids = new Set<string>()
        for (const r of Object.values(get().getMergedMap())) {
          for (const p of r.products) ids.add(p)
        }
        return [...ids].sort()
      },

      resolveRecipe(id) {
        return get().getRecipeById(id)
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state): UserRecipeSet => ({
        recipes: state.userRecipes,
      }),
      merge: (persisted, current) => {
        const p = persisted as UserRecipeSet
        return {
          ...current,
          userRecipes: p?.recipes ?? [],
        }
      },
    }
  )
)

// ============================================================
// Convenience: read bundled data without store
// ============================================================

export function getBundledMap(): RecipeMap {
  return BUNDLED_MAP
}

export function getBundledRecipes(): Recipe[] {
  return BUNDLED_RECIPES
}
