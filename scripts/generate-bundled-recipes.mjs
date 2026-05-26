/**
 * Regenerates src/recipes/bundled.json from the FactorioLab "spa" (Space Age)
 * dataset — a structured, maintained source of every base + Space Age item and
 * recipe. We map it into our Recipe { id, label, inputs[], products[] } schema.
 *
 * Run: node scripts/generate-bundled-recipes.mjs
 *
 * Data model (as of the recipe-centric refactor):
 *   Recipe { id, label, inputs[], products[] }
 *   - products[] preserves FactorioLab output order verbatim; products[0] is primary.
 *   - inputs[] / products[] are item ids only — no quantities (shape-only schema).
 *   - Raw/leaf resources are recipes with empty inputs[] and a single-element products[].
 *
 * Recipe id scheme: use FactorioLab's own recipe id (already kebab-case and stable).
 *   For raw/leaf defaults we synthesise "<item-id>-default".
 *   For the curated flat variants we use "<item-id>-flat".
 *
 * Exclusion policy (kept intentionally narrow — more is better for a planner):
 *   - Mining / pumping / offshore-pump recipes: excluded — raws stay raw leaves.
 *   - Barrel-filling recipes: excluded — not a production path; reverse is too.
 *     EXCEPTION: empty-*-barrel (unbarreling) retained — they're real production steps.
 *     Actually: all barrel recipes excluded to keep catalog clean. Barreling/unbarreling
 *     is logistics, not production planning.
 *   - Generic recycling (recycler machine): almost all excluded — 189 recipes would
 *     massively bloat the catalog and represent automation cleanup, not planned
 *     production. EXCEPTIONS retained:
 *       scrap-recycling  — canonical Fulgora multi-output; planner needs to model it.
 *       nuclear-fuel-recycling — meaningful planned step for nuclear cycles.
 *   - Recipes with no outputs: excluded.
 *
 * Curated abstraction variants (circuit "flat") are re-appended at the end.
 */
import { writeFile } from 'node:fs/promises'

const DATA_URL = 'https://raw.githubusercontent.com/factoriolab/factoriolab/main/src/data/spa/data.json'

const title = s => s.split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')

const res = await fetch(DATA_URL)
if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
const data = await res.json()
const { items, recipes } = data
const itemName = new Map(items.map(i => [i.id, i.name]))

// ──────────────────────────────────────────────────────────────
// Recycler allowlist — the only recycler recipes we keep.
// ──────────────────────────────────────────────────────────────
const RECYCLER_ALLOWLIST = new Set(['scrap-recycling', 'nuclear-fuel-recycling'])

function isMining(r) {
  return r.category === 'mining' || !!r.producers?.some(p => /mining-drill|pumpjack|offshore-pump/.test(p))
}

function isExcluded(r) {
  if (!r.out || Object.keys(r.out).length === 0) return true
  // Recycler recipes: exclude unless allowlisted
  if (r.producers?.includes('recycler') || r.id.endsWith('-recycling')) {
    return !RECYCLER_ALLOWLIST.has(r.id)
  }
  if (/barrel/.test(r.id)) return true
  if (isMining(r)) return true
  return false
}

// Items obtained by mining/pumping are "raw" — they default to a leaf even if
// they ALSO have exotic production recipes (Gleba bacteria, asteroid crushing),
// which are kept as non-default variants.
const rawItems = new Set()
for (const r of recipes) {
  if (isMining(r) && r.out) for (const o of Object.keys(r.out)) rawItems.add(o)
}

// ──────────────────────────────────────────────────────────────
// Build the recipe list directly in the new Recipe shape.
// Each FactorioLab recipe maps to exactly one Recipe entry
// (multi-output is now first-class, not split per product).
// ──────────────────────────────────────────────────────────────
const out = []

// Track which item ids are covered as a product of some recipe
const coveredProducts = new Set()

// First pass: emit one Recipe per FactorioLab recipe (non-excluded)
const recipeEntries = []
for (const r of recipes) {
  if (isExcluded(r)) continue

  const inputs = Object.keys(r.in ?? {})
  const products = Object.keys(r.out)

  // Determine a human label for this recipe entry.
  // If the recipe id matches a single product id, use the item name.
  // Otherwise use the recipe's own name.
  const singleProductMatch = products.length === 1 && products[0] === r.id
  const label = singleProductMatch
    ? title(itemName.get(products[0]) ?? r.name)
    : title(r.name)

  recipeEntries.push({
    id: r.id,
    label,
    inputs,
    products,
    // Metadata for default-variant logic below
    _recipeName: r.name,
    _singleProduct: products.length === 1 ? products[0] : null,
  })

  for (const p of products) coveredProducts.add(p)
}

// ──────────────────────────────────────────────────────────────
// Second pass: iterate items in FactorioLab order (stable).
// Emit raw leaves for items that need them, then collect all
// recipe entries that produce this item as their primary (first) product.
// ──────────────────────────────────────────────────────────────
//
// We emit entries in item order so the final JSON is predictable.
// Multi-output recipes appear once, anchored to their first product's position.
//
const emittedRecipeIds = new Set()

for (const item of items) {
  const id = item.id
  const name = title(item.name)
  const isRaw = rawItems.has(id)

  // Collect recipes where this item is products[0] (primary)
  const primaries = recipeEntries.filter(e => e.products[0] === id)

  if (isRaw || primaries.length === 0) {
    // Emit a raw leaf entry (empty inputs, single product)
    out.push({ id: `${id}-default`, label: name, inputs: [], products: [id] })
    coveredProducts.add(id)
    // Still emit any non-mining production recipes for this item as alternates
    for (const e of primaries) {
      if (emittedRecipeIds.has(e.id)) continue
      emittedRecipeIds.add(e.id)
      out.push({ id: e.id, label: e.label, inputs: e.inputs, products: e.products })
    }
    continue
  }

  // Determine default: prefer recipe id == item id, then single-product recipes
  let defIdx = primaries.findIndex(e => e.id === id)
  if (defIdx < 0) defIdx = primaries.findIndex(e => e._singleProduct !== null)
  if (defIdx < 0) {
    // Pick shortest inputs as default
    defIdx = 0
    for (let i = 1; i < primaries.length; i++) {
      if (primaries[i].inputs.length < primaries[defIdx].inputs.length) defIdx = i
    }
  }

  // Re-order: default first, then alternates
  const ordered = [primaries[defIdx], ...primaries.slice(0, defIdx), ...primaries.slice(defIdx + 1)]

  for (const e of ordered) {
    if (emittedRecipeIds.has(e.id)) continue
    emittedRecipeIds.add(e.id)
    out.push({ id: e.id, label: e.label, inputs: e.inputs, products: e.products })
  }
}

// ──────────────────────────────────────────────────────────────
// Emit any multi-output recipe entries not yet emitted
// (their primary product wasn't encountered in items list — rare).
// ──────────────────────────────────────────────────────────────
for (const e of recipeEntries) {
  if (emittedRecipeIds.has(e.id)) continue
  emittedRecipeIds.add(e.id)
  out.push({ id: e.id, label: e.label, inputs: e.inputs, products: e.products })
}

// ──────────────────────────────────────────────────────────────
// Ensure every referenced input exists as a product somewhere.
// ──────────────────────────────────────────────────────────────
const producedIds = new Set(out.flatMap(r => r.products))
const referenced = new Set(out.flatMap(r => r.inputs))
for (const id of referenced) {
  if (producedIds.has(id)) continue
  const name = title((itemName.get(id) ?? id).replace(/-/g, ' '))
  out.push({ id: `${id}-default`, label: name, inputs: [], products: [id] })
  producedIds.add(id)
}

// ──────────────────────────────────────────────────────────────
// Curated abstraction variants (flatten the copper-cable step).
// ──────────────────────────────────────────────────────────────
out.push({ id: 'electronic-circuit-flat', label: 'Electronic Circuit (flat)', inputs: ['iron-plate', 'copper-plate'], products: ['electronic-circuit'] })
out.push({ id: 'advanced-circuit-flat', label: 'Advanced Circuit (flat)', inputs: ['electronic-circuit', 'plastic-bar', 'copper-plate'], products: ['advanced-circuit'] })

// ──────────────────────────────────────────────────────────────
// Strip internal metadata and write.
// ──────────────────────────────────────────────────────────────
const clean = out.map(({ id, label, inputs, products }) => ({ id, label, inputs, products }))

await writeFile(new URL('../src/recipes/bundled.json', import.meta.url), JSON.stringify(clean, null, 2) + '\n')

// Stats
const multiProductRecipes = clean.filter(r => r.products.length > 1)
console.log(`source items=${items.length} recipes=${recipes.length}`)
console.log(`written: total=${clean.length}, multi-product=${multiProductRecipes.length}`)
console.log('\nMulti-product recipes:')
for (const r of multiProductRecipes) {
  console.log(`  [${r.id}] products: ${r.products.join(', ')}`)
}
const ammoniaRecipe = clean.find(r => r.products.includes('ammonia'))
console.log('\nAmmonia recipe:', JSON.stringify(ammoniaRecipe))
console.log('Scrap recycling:', JSON.stringify(clean.find(r => r.id === 'scrap-recycling')))
console.log('Kovarex:', JSON.stringify(clean.find(r => r.id === 'kovarex-enrichment-process')))
console.log('Advanced oil:', JSON.stringify(clean.find(r => r.id === 'advanced-oil-processing')))
