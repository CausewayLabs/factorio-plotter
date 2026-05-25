/**
 * Regenerates src/recipes/bundled.json from the FactorioLab "spa" (Space Age)
 * dataset — a structured, maintained source of every base + Space Age item and
 * recipe. We map it into our shape-only schema (inputs only, no quantities).
 *
 * Run: node scripts/generate-bundled-recipes.mjs
 *
 * Rules:
 *  - One product per item; label = its official name (Title Cased).
 *  - Inputs = keys of the recipe's `in`. Multiple recipes -> multiple variants.
 *  - Excluded so raws stay raw and the catalog stays clean:
 *      recycling (recycler / *-recycling), mining/pumping, barreling.
 *  - Curated abstraction variants (circuit "flat") are re-appended at the end.
 */
import { writeFile } from 'node:fs/promises'

const DATA_URL = 'https://raw.githubusercontent.com/factoriolab/factoriolab/main/src/data/spa/data.json'

const title = s => s.split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')

const res = await fetch(DATA_URL)
if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
const data = await res.json()
const { items, recipes } = data
const itemName = new Map(items.map(i => [i.id, i.name]))

function isMining(r) {
  return r.category === 'mining' || !!r.producers?.some(p => /mining-drill|pumpjack|offshore-pump/.test(p))
}

function isExcluded(r) {
  if (!r.out || Object.keys(r.out).length === 0) return true
  if (r.producers?.includes('recycler')) return true
  if (r.id.endsWith('-recycling')) return true
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

// productId -> candidate variants
const byProduct = new Map()
for (const r of recipes) {
  if (isExcluded(r)) continue
  const outs = Object.keys(r.out)
  const inputs = Object.keys(r.in ?? {})
  let targets
  if (outs.includes(r.id)) targets = [r.id]
  else if (outs.length === 1) targets = [outs[0]]
  else targets = outs // multi-output (e.g. oil processing): a variant for each
  for (const t of targets) {
    if (!itemName.has(t)) continue
    if (!byProduct.has(t)) byProduct.set(t, [])
    byProduct.get(t).push({ inputs, recipeId: r.id, recipeName: r.name, single: outs.length === 1 })
  }
}

const out = []
for (const item of items) {
  const id = item.id
  const name = title(item.name)
  const cands = byProduct.get(id) ?? []
  const seen = new Set()
  const uniq = []
  for (const c of cands) {
    const k = [...c.inputs].sort().join('|')
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push(c)
  }

  const raw = rawItems.has(id)
  const variantLabel = c => (c.recipeId === id || c.recipeName === item.name) ? name : `${name} (${title(c.recipeName)})`
  const usedVid = new Set()

  if (raw || uniq.length === 0) {
    // Leaf default (raw resource); keep any production recipes as extra variants.
    out.push({ product: id, variantId: 'default', label: name, inputs: [], isDefault: true })
    uniq.forEach((c, i) => {
      let vid = c.recipeId
      if (usedVid.has(vid)) vid = `${vid}-${i}`
      usedVid.add(vid)
      out.push({ product: id, variantId: vid, label: variantLabel(c), inputs: c.inputs, isDefault: false })
    })
    continue
  }

  let defIdx = uniq.findIndex(c => c.recipeId === id)
  if (defIdx < 0) defIdx = uniq.findIndex(c => c.single)
  if (defIdx < 0) {
    defIdx = 0
    for (let i = 1; i < uniq.length; i++) if (uniq[i].inputs.length < uniq[defIdx].inputs.length) defIdx = i
  }
  uniq.forEach((c, i) => {
    const isDef = i === defIdx
    let vid = isDef ? 'default' : c.recipeId
    if (usedVid.has(vid)) vid = `${vid}-${i}`
    usedVid.add(vid)
    // The default always shows the plain item name; alternates carry the recipe hint.
    out.push({ product: id, variantId: vid, label: isDef ? name : variantLabel(c), inputs: c.inputs, isDefault: isDef })
  })
}

// Ensure every referenced input exists as a product (leaf if otherwise unknown).
const products = new Set(out.map(o => o.product))
const referenced = new Set()
for (const o of out) for (const i of o.inputs) referenced.add(i)
for (const id of referenced) {
  if (products.has(id)) continue
  out.push({ product: id, variantId: 'default', label: title((itemName.get(id) ?? id).replace(/-/g, ' ')), inputs: [], isDefault: true })
  products.add(id)
}

// Curated abstraction variants (flatten the copper-cable step) — kept from the original seed.
out.push({ product: 'electronic-circuit', variantId: 'flat', label: 'Electronic Circuit (flat)', inputs: ['iron-plate', 'copper-plate'], isDefault: false })
out.push({ product: 'advanced-circuit', variantId: 'flat', label: 'Advanced Circuit (flat)', inputs: ['electronic-circuit', 'plastic-bar', 'copper-plate'], isDefault: false })

await writeFile(new URL('../src/recipes/bundled.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')

console.log(`source items=${items.length} recipes=${recipes.length}`)
console.log(`written: products=${products.size} variants=${out.length}`)
console.log('advanced-circuit:', JSON.stringify(out.filter(o => o.product === 'advanced-circuit')))
console.log('scrap basics present:', ['ice', 'concrete', 'holmium-ore', 'scrap'].map(p => `${p}=${out.some(o => o.product === p)}`).join(' '))
