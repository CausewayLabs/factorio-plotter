/**
 * Recipe Editor — create/edit user-authored recipes.
 * Writes into the user-set Zustand store (persisted to localStorage).
 * Opens as a modal panel.
 */
import { useMemo, useState } from 'react'
import { useRecipeStore, getBundledMap } from '../recipes/store'
import type { Recipe } from '../recipes/types'
import { resolveProductId } from '../recipes/normalize'
import { prettify } from '../recipes/labels'

interface Props {
  onClose: () => void
  /** Pre-fill editing an existing recipe by id */
  editRecipeId?: string
}

/** Derive a kebab-case id from a label string. */
function labelToId(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function RecipeEditor({ onClose, editRecipeId }: Props) {
  const upsertRecipe = useRecipeStore(s => s.upsertRecipe)
  const removeRecipe = useRecipeStore(s => s.removeRecipe)
  const getAllRecipes = useRecipeStore(s => s.getAllRecipes)
  const getMergedMap = useRecipeStore(s => s.getMergedMap)
  const getRecipeById = useRecipeStore(s => s.getRecipeById)

  const existingRecipe = editRecipeId ? getRecipeById(editRecipeId) : null

  const [recipeId, setRecipeId] = useState(existingRecipe?.id ?? '')
  const [label, setLabel] = useState(existingRecipe?.label ?? '')
  const [inputs, setInputs] = useState<string[]>(existingRecipe?.inputs ?? [])
  const [products, setProducts] = useState<string[]>(existingRecipe?.products ?? [])
  const [ingredientDraft, setIngredientDraft] = useState('')
  const [productDraft, setProductDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [listFilter, setListFilter] = useState('')

  const bundledMap = getBundledMap()

  // All known product ids across the merged map (union of all products[])
  const mergedMap = getMergedMap()
  const allProductIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of Object.values(mergedMap)) {
      for (const p of r.products) ids.add(p)
    }
    return [...ids].sort()
  }, [mergedMap])

  // product id → label (from first recipe that produces it)
  const productLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of Object.values(mergedMap)) {
      for (const p of r.products) {
        if (!m[p]) m[p] = r.label
      }
    }
    return m
  }, [mergedMap])

  const labelOf = (id: string) => productLabels[id] ?? prettify(id)

  const allRecipes = useMemo(() => getAllRecipes(), [getAllRecipes])

  // Ingredient draft resolution
  const ingredientMatch = ingredientDraft.trim()
    ? resolveProductId(ingredientDraft, allProductIds, labelOf)
    : null

  // Product draft resolution
  const productMatch = productDraft.trim()
    ? resolveProductId(productDraft, allProductIds, labelOf)
    : null

  function addIngredient(id: string) {
    if (!inputs.includes(id)) setInputs([...inputs, id])
    setIngredientDraft('')
  }

  function commitIngredientDraft() {
    if (ingredientMatch) addIngredient(ingredientMatch)
  }

  function createIngredient() {
    const t = ingredientDraft.trim()
    if (!t || inputs.includes(t)) return
    setInputs([...inputs, t])
    setIngredientDraft('')
  }

  function removeIngredient(id: string) {
    setInputs(inputs.filter(i => i !== id))
  }

  function addProduct(id: string) {
    if (!products.includes(id)) setProducts([...products, id])
    setProductDraft('')
  }

  function commitProductDraft() {
    if (productMatch) addProduct(productMatch)
  }

  function createProduct() {
    const t = productDraft.trim()
    if (!t || products.includes(t)) return
    setProducts([...products, t])
    setProductDraft('')
  }

  function removeProduct(id: string) {
    setProducts(products.filter(p => p !== id))
  }

  // When label changes, auto-derive id if id is empty or was auto-derived
  function handleLabelChange(val: string) {
    setLabel(val)
    setSaved(false)
    // Auto-fill id only if the id hasn't been manually overridden
    if (!recipeId || recipeId === labelToId(label)) {
      setRecipeId(labelToId(val))
    }
  }

  function handleRecipeSelect(r: Recipe) {
    setRecipeId(r.id)
    setLabel(r.label)
    setInputs(r.inputs)
    setProducts(r.products)
    setIngredientDraft('')
    setProductDraft('')
    setSaved(false)
  }

  function handleSave() {
    if (!recipeId.trim() || products.length === 0) return
    const recipe: Recipe = {
      id: recipeId.trim(),
      label: label.trim() || recipeId.trim(),
      inputs: inputs.map(s => s.trim()).filter(Boolean),
      products: products.map(s => s.trim()).filter(Boolean),
    }
    upsertRecipe(recipe)
    setSaved(true)
  }

  function handleDelete() {
    if (!recipeId.trim()) return
    if (!confirm(`Delete recipe "${recipeId}"?`)) return
    removeRecipe(recipeId.trim())
    setRecipeId('')
    setLabel('')
    setInputs([])
    setProducts([])
    setIngredientDraft('')
    setProductDraft('')
    setSaved(false)
  }

  function handleNewRecipe() {
    setRecipeId('')
    setLabel('')
    setInputs([])
    setProducts([])
    setIngredientDraft('')
    setProductDraft('')
    setSaved(false)
  }

  const filteredRecipes = listFilter.trim()
    ? allRecipes.filter(r =>
        r.label.toLowerCase().includes(listFilter.toLowerCase()) ||
        r.id.toLowerCase().includes(listFilter.toLowerCase())
      )
    : allRecipes

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const panelStyle: React.CSSProperties = {
    background: '#16213e', border: '1px solid #4a9eff', borderRadius: 8,
    padding: 24, width: 780, maxWidth: '94vw', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', gap: 14,
  }
  const inputStyle: React.CSSProperties = {
    background: '#0f1628', border: '1px solid #4a4a6a', color: '#e0e0ff',
    borderRadius: 4, padding: '6px 8px', fontSize: 13, width: '100%',
  }
  const labelStyle: React.CSSProperties = { color: '#8080c0', fontSize: 11, marginBottom: 3 }

  function ChipList({ items, known, onRemove }: { items: string[]; known: string[]; onRemove: (id: string) => void }) {
    if (items.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {items.map(id => {
          const isKnown = known.includes(id)
          return (
            <span
              key={id}
              title={isKnown ? id : `${id} (not in catalog yet)`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: '#0f1628', border: `1px solid ${isKnown ? '#4a4a6a' : '#8060a0'}`,
                borderRadius: 10, padding: '2px 5px 2px 9px', fontSize: 11.5, color: '#d8dcf0',
              }}
            >
              {labelOf(id)}
              {!isKnown && <span style={{ color: '#a090c0', fontSize: 9 }}>new</span>}
              <span
                onClick={() => onRemove(id)}
                title="Remove"
                style={{ cursor: 'pointer', color: '#8088a0', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
              >×</span>
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#e0e0ff', margin: 0, fontSize: 15 }}>Recipe Editor</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#808080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 16, minHeight: 0, flex: 1 }}>
          {/* Left dock: browse existing recipes */}
          <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, borderRight: '1px solid #2a2a4a', paddingRight: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={labelStyle}>Existing Recipes</span>
              <button
                onClick={handleNewRecipe}
                style={{ background: '#2a4a7f', color: '#e0e0ff', border: '1px solid #4a9eff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
              >
                + New
              </button>
            </div>
            <input
              value={listFilter}
              onChange={e => setListFilter(e.target.value)}
              placeholder="Filter..."
              style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
            />
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {filteredRecipes.map(r => {
                const isRaw = r.inputs.length === 0
                const isBundled = !!bundledMap[r.id]
                const active = recipeId === r.id
                return (
                  <div
                    key={r.id}
                    onClick={() => handleRecipeSelect(r)}
                    title={isRaw ? 'raw / leaf' : r.inputs.join(', ')}
                    style={{
                      padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                      background: active ? '#2a4a7f' : 'transparent',
                      color: active ? '#e0e0ff' : '#c0c0d0',
                      fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.label}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 9, color: isBundled ? '#606080' : '#60a0e0' }}>
                      {isRaw ? 'raw' : `${r.inputs.length}in`}
                      {r.products.length > 1 && `·${r.products.length}out`}
                      {!isBundled && ' ★'}
                    </span>
                  </div>
                )
              })}
              {filteredRecipes.length === 0 && (
                <div style={{ color: '#606080', fontSize: 12, padding: '6px 8px' }}>No matches</div>
              )}
            </div>
            <div style={{ color: '#404060', fontSize: 9 }}>★ = user-authored</div>
          </div>

          {/* Right: authoring form */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <div>
              <div style={labelStyle}>Display Label</div>
              <input
                value={label}
                onChange={e => handleLabelChange(e.target.value)}
                placeholder="e.g. Iron Plate Smelting"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>Recipe ID (auto-derived from label)</div>
              <input
                value={recipeId}
                onChange={e => { setRecipeId(e.target.value); setSaved(false) }}
                placeholder="e.g. iron-plate-smelting"
                style={inputStyle}
              />
            </div>

            {/* Inputs */}
            <div>
              <div style={labelStyle}>Inputs (empty = raw/leaf resource)</div>
              <ChipList items={inputs} known={allProductIds} onRemove={removeIngredient} />
              <input
                list="ingredient-list"
                value={ingredientDraft}
                onChange={e => setIngredientDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitIngredientDraft() } }}
                placeholder="Type to find a product, then Enter…"
                style={inputStyle}
              />
              <datalist id="ingredient-list">
                {allProductIds.map(p => <option key={p} value={labelOf(p)} />)}
              </datalist>
              {ingredientDraft.trim() && (
                ingredientMatch ? (
                  <button
                    onClick={() => addIngredient(ingredientMatch)}
                    style={{ marginTop: 6, padding: '5px 10px', background: '#2a4a7f', color: '#e0e0ff', border: '1px solid #4a9eff', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                  >
                    Add "{labelOf(ingredientMatch)}"
                  </button>
                ) : (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#c08080', fontSize: 11 }}>No match.</span>
                    <button
                      onClick={createIngredient}
                      style={{ padding: '5px 10px', background: '#3a2f4a', color: '#e0d0ff', border: '1px solid #8060a0', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                    >
                      Create "{ingredientDraft.trim()}"
                    </button>
                  </div>
                )
              )}
            </div>

            {/* Products */}
            <div>
              <div style={labelStyle}>Products (at least one required)</div>
              <ChipList items={products} known={allProductIds} onRemove={removeProduct} />
              <input
                list="product-list"
                value={productDraft}
                onChange={e => setProductDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitProductDraft() } }}
                placeholder="Type to find a product, then Enter…"
                style={inputStyle}
              />
              <datalist id="product-list">
                {allProductIds.map(p => <option key={p} value={labelOf(p)} />)}
              </datalist>
              {productDraft.trim() && (
                productMatch ? (
                  <button
                    onClick={() => addProduct(productMatch)}
                    style={{ marginTop: 6, padding: '5px 10px', background: '#2a4a7f', color: '#e0e0ff', border: '1px solid #4a9eff', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                  >
                    Add "{labelOf(productMatch)}"
                  </button>
                ) : (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#c08080', fontSize: 11 }}>No match.</span>
                    <button
                      onClick={createProduct}
                      style={{ padding: '5px 10px', background: '#3a2f4a', color: '#e0d0ff', border: '1px solid #8060a0', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                    >
                      Create "{productDraft.trim()}"
                    </button>
                  </div>
                )
              )}
            </div>

            {saved && (
              <div style={{ color: '#60e060', fontSize: 12 }}>Saved!</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button
                onClick={handleDelete}
                disabled={!recipeId.trim()}
                style={{ padding: '6px 12px', background: '#4a1a1a', color: '#e06060', border: '1px solid #6a2a2a', borderRadius: 4, cursor: recipeId.trim() ? 'pointer' : 'not-allowed', fontSize: 13 }}
              >
                Delete Recipe
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} style={{ padding: '6px 14px', background: '#2a2a4a', color: '#e0e0ff', border: '1px solid #4a4a6a', borderRadius: 4, cursor: 'pointer' }}>Close</button>
                <button
                  onClick={handleSave}
                  disabled={!recipeId.trim() || products.length === 0}
                  style={{ padding: '6px 14px', background: recipeId.trim() && products.length > 0 ? '#4a9eff' : '#1a1a3a', color: recipeId.trim() && products.length > 0 ? '#000' : '#606080', border: 'none', borderRadius: 4, cursor: recipeId.trim() && products.length > 0 ? 'pointer' : 'not-allowed' }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
