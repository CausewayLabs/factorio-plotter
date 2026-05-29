/**
 * Recipe picker modal — choose a recipe to place as a bubble.
 * Search by recipe label or by product name (shows a "via X" tag).
 * Default recipes (products[0] match) sort first.
 */
import { useMemo, useState } from 'react'
import { useRecipeStore, makeRawRecipe } from '../recipes/store'
import type { Recipe } from '../recipes/types'

interface Props {
  onSelect: (recipeId: string) => void
  onClose: () => void
}

interface RecipeRow {
  recipe: Recipe
  /** Product that matched the search query (for tag display), or null if matched by recipe label */
  matchedViaProduct: string | null
}

export default function ProductPicker({ onSelect, onClose }: Props) {
  const getAllRecipes = useRecipeStore(s => s.getAllRecipes)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)

  const allRecipes = useMemo(() => getAllRecipes(), [getAllRecipes])

  const rows: RecipeRow[] = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) {
      return allRecipes.map(r => ({ recipe: r, matchedViaProduct: null }))
    }
    const result: RecipeRow[] = []
    const matchedProducts = new Set<string>()
    const productsWithRaw = new Set<string>()
    for (const r of allRecipes) {
      if (r.inputs.length === 0) r.products.forEach(p => productsWithRaw.add(p))
      // Match by recipe label
      if (r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)) {
        result.push({ recipe: r, matchedViaProduct: null })
        continue
      }
      // Match by any product name
      const matchedProduct = r.products.find(p => p.toLowerCase().includes(q))
      if (matchedProduct) {
        result.push({ recipe: r, matchedViaProduct: matchedProduct })
        matchedProducts.add(matchedProduct)
      }
    }
    // For any product matched by name that has no catalog raw recipe, offer a
    // synthetic "raw input" row so any item can be placed as an external supply.
    for (const p of matchedProducts) {
      if (!productsWithRaw.has(p)) {
        result.push({ recipe: makeRawRecipe(p), matchedViaProduct: p })
      }
    }
    // Sort: primary product matches (products[0] === match) first
    result.sort((a, b) => {
      const aPrimary = a.matchedViaProduct !== null && a.recipe.products[0] === a.matchedViaProduct
      const bPrimary = b.matchedViaProduct !== null && b.recipe.products[0] === b.matchedViaProduct
      if (aPrimary && !bPrimary) return -1
      if (!aPrimary && bPrimary) return 1
      return 0
    })
    return result
  }, [allRecipes, filter])

  function handleSelect() {
    if (!selected) return
    onSelect(selected)
  }

  function handleFilterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[highlight]
      if (row) onSelect(row.recipe.id)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  const panelStyle: React.CSSProperties = {
    background: '#16213e', border: '1px solid #4a9eff', borderRadius: 8,
    padding: 20, minWidth: 360, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 10,
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#e0e0ff', margin: 0, fontSize: 15 }}>Choose Recipe</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#808080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <input
          autoFocus
          value={filter}
          onChange={e => { setFilter(e.target.value); setHighlight(0) }}
          onKeyDown={handleFilterKeyDown}
          placeholder="Search recipes or products… (↑/↓ + Enter)"
          style={{ background: '#0f1628', border: '1px solid #4a4a6a', color: '#e0e0ff', borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
        />

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map(({ recipe, matchedViaProduct }, i) => {
            const isRaw = recipe.inputs.length === 0
            const isActive = selected === recipe.id || (selected === null && i === highlight)
            return (
              <div
                key={recipe.id}
                onClick={() => { setSelected(recipe.id); setHighlight(i) }}
                onDoubleClick={() => onSelect(recipe.id)}
                style={{
                  padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                  background: isActive ? '#2a4a7f' : 'transparent',
                  color: isActive ? '#e0e0ff' : '#c0c0d0',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 13,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {recipe.label}
                  {matchedViaProduct && (
                    <span style={{ fontSize: 10, color: '#6080c0', background: '#1a2040', borderRadius: 3, padding: '1px 5px' }}>
                      via {matchedViaProduct}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 10, color: '#606080', flexShrink: 0 }}>
                  {isRaw ? 'raw' : `${recipe.inputs.length} in`}
                  {recipe.products.length > 1 && ` · ${recipe.products.length} out`}
                </span>
              </div>
            )
          })}
          {rows.length === 0 && (
            <div style={{ color: '#606080', fontSize: 12, padding: '6px 10px' }}>No matches</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', background: '#2a2a4a', color: '#e0e0ff', border: '1px solid #4a4a6a', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSelect}
            disabled={!selected}
            style={{ padding: '6px 14px', background: selected ? '#4a9eff' : '#1a1a3a', color: selected ? '#000' : '#606080', border: 'none', borderRadius: 4, cursor: selected ? 'pointer' : 'not-allowed' }}
          >
            Place
          </button>
        </div>
      </div>
    </div>
  )
}
