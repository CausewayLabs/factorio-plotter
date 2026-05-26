import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import bundledData from './bundled.json'
import type { Recipe, RecipeMap, UserRecipeSet } from './types'

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
        return get().getMergedMap()[id] ?? null
      },

      getRecipesForProduct(productId) {
        const all = Object.values(get().getMergedMap())
        const matching = all.filter(r => r.products.includes(productId))
        return matching.sort((a, b) => {
          const aPrimary = a.products[0] === productId
          const bPrimary = b.products[0] === productId
          if (aPrimary && !bPrimary) return -1
          if (!aPrimary && bPrimary) return 1
          return a.id.localeCompare(b.id)
        })
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
