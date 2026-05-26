/**
 * Static icon-atlas module for the bundled FactorioLab sprite sheet.
 *
 * The sprite sheet (icons.webp) is a fixed-grid atlas where every cell is
 * SPRITE_SIZE × SPRITE_SIZE pixels.  The atlas JSON maps item/icon ids to the
 * top-left pixel coordinate of their cell.
 *
 * Usage:
 *   import { getIconCoords, resolveRecipeIconId, SPRITE_SIZE, iconsUrl } from './iconAtlas'
 */
import atlasData from './iconAtlas.json'
import iconsWebp from './icons.webp?url'
import type { Recipe } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IconAtlasEntry {
  x: number
  y: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Sprite cell size in the FactorioLab sheet (px). Sourced from atlas JSON. */
export const SPRITE_SIZE: number = atlasData.spriteSize

/** Vite-resolved URL for the bundled sprite sheet. */
export const iconsUrl: string = iconsWebp

// ── Atlas lookup ──────────────────────────────────────────────────────────────

const _entries: Record<string, IconAtlasEntry> = atlasData.entries as Record<string, IconAtlasEntry>

/**
 * Return the top-left pixel coordinate of `iconId`'s cell in the sprite sheet,
 * or `undefined` if the id is not present in the atlas.
 */
export function getIconCoords(iconId: string): IconAtlasEntry | undefined {
  return _entries[iconId]
}

// ── Icon-id resolution ────────────────────────────────────────────────────────

/**
 * Resolve the atlas key for a recipe.
 * Strategy: use `products[0]` (the primary product item id) since that is the
 * canonical icon for any production step.  Returns `undefined` if the recipe
 * has no products (should never happen in practice).
 */
export function resolveRecipeIconId(recipe: Recipe): string | undefined {
  return recipe.products[0]
}
