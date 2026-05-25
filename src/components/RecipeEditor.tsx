/**
 * Recipe Editor — create/edit user-authored products and recipes.
 * Writes into the user-set Zustand store (persisted to localStorage).
 * Opens as a modal panel.
 */
import { useMemo, useState } from 'react'
import { useRecipeStore, getBundledCatalog } from '../recipes/store'
import type { RecipeVariant } from '../recipes/types'
import { resolveProductId } from '../recipes/normalize'

interface Props {
  onClose: () => void
  /** Pre-fill editing an existing product */
  editProduct?: string
}

/** Turn a resource id like "copper-plate" into "Copper Plate". */
function prettify(id: string): string {
  return id
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function RecipeEditor({ onClose, editProduct }: Props) {
  const upsertVariant = useRecipeStore(s => s.upsertVariant)
  const removeVariant = useRecipeStore(s => s.removeVariant)
  const getVariantsForProduct = useRecipeStore(s => s.getVariantsForProduct)
  const getMergedCatalog = useRecipeStore(s => s.getMergedCatalog)

  const [productId, setProductId] = useState(editProduct ?? '')
  const [variantId, setVariantId] = useState('default')
  const [label, setLabel] = useState('')
  const [inputs, setInputs] = useState<string[]>([])
  const [ingredientDraft, setIngredientDraft] = useState('')
  const [isDefault, setIsDefault] = useState(true)
  const [saved, setSaved] = useState(false)
  const [listFilter, setListFilter] = useState('')

  const bundledCatalog = getBundledCatalog()

  // Build a product-id → default-label map once per render (from the merged
  // catalog) to drive autocomplete and id↔label resolution without repeatedly
  // rebuilding the catalog per candidate.
  const catalog = getMergedCatalog()
  const productLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const [pid, variants] of Object.entries(catalog)) {
      const vs = Object.values(variants)
      const def = vs.find(v => v.isDefault) ?? vs[0]
      m[pid] = def?.label ?? pid
    }
    return m
  }, [catalog])
  const allProducts = useMemo(() => Object.keys(catalog).sort(), [catalog])
  const labelOf = (id: string) => productLabels[id] ?? prettify(id)

  // Resolve the current ingredient draft to a known product (case/hyphen-
  // insensitive, by id or label). Drives force-matching + the create escape.
  const draftMatch = ingredientDraft.trim()
    ? resolveProductId(ingredientDraft, allProducts, labelOf)
    : null

  function addIngredient(id: string) {
    if (!inputs.includes(id)) setInputs([...inputs, id])
    setIngredientDraft('')
  }

  /** Enter / pick: add the matched product, or no-op (the create button covers misses). */
  function commitIngredientDraft() {
    const t = ingredientDraft.trim()
    if (!t) return
    if (draftMatch) addIngredient(draftMatch)
  }

  function createIngredient() {
    const t = ingredientDraft.trim()
    if (!t) return
    if (!inputs.includes(t)) setInputs([...inputs, t])
    setIngredientDraft('')
  }

  function removeIngredient(id: string) {
    setInputs(inputs.filter(i => i !== id))
  }

  // When productId changes, try to fill from existing variant
  function handleProductChange(pid: string) {
    setProductId(pid)
    setSaved(false)
    const variants = getVariantsForProduct(pid)
    if (variants.length > 0) {
      const def = variants.find(v => v.isDefault) ?? variants[0]
      setVariantId(def.variantId)
      setLabel(def.label)
      setInputs(def.inputs)
      setIsDefault(def.isDefault)
    } else {
      setLabel('')
      setInputs([])
      setVariantId('default')
      setIsDefault(true)
    }
    setIngredientDraft('')
  }

  function handleSave() {
    if (!productId.trim()) return
    const variant: RecipeVariant = {
      product: productId.trim(),
      variantId: variantId.trim() || 'default',
      label: label.trim() || productId.trim(),
      inputs: inputs.map(s => s.trim()).filter(Boolean),
      isDefault,
    }
    upsertVariant(variant)
    setSaved(true)
  }

  function handleDelete() {
    if (!productId.trim() || !variantId.trim()) return
    if (!confirm(`Delete variant "${variantId}" of "${productId}"?`)) return
    removeVariant(productId.trim(), variantId.trim())
    setProductId('')
    setVariantId('default')
    setLabel('')
    setInputs([])
    setIngredientDraft('')
    setSaved(false)
  }

  const filteredProducts = listFilter.trim()
    ? allProducts.filter(p => p.toLowerCase().includes(listFilter.toLowerCase()))
    : allProducts

  function handleNewProduct() {
    setProductId('')
    setVariantId('default')
    setLabel('')
    setInputs([])
    setIngredientDraft('')
    setIsDefault(true)
    setSaved(false)
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const panelStyle: React.CSSProperties = {
    background: '#16213e', border: '1px solid #4a9eff', borderRadius: 8,
    padding: 24, width: 720, maxWidth: '92vw', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', gap: 14,
  }
  const inputStyle: React.CSSProperties = {
    background: '#0f1628', border: '1px solid #4a4a6a', color: '#e0e0ff',
    borderRadius: 4, padding: '6px 8px', fontSize: 13, width: '100%',
  }
  const labelStyle: React.CSSProperties = { color: '#8080c0', fontSize: 11, marginBottom: 3 }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#e0e0ff', margin: 0, fontSize: 15 }}>Recipe Editor</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#808080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 16, minHeight: 0, flex: 1 }}>
          {/* Left dock: browse existing products & recipes */}
          <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, borderRight: '1px solid #2a2a4a', paddingRight: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={labelStyle}>Existing Products</span>
              <button
                onClick={handleNewProduct}
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
              {filteredProducts.map(pid => {
                const variants = getVariantsForProduct(pid)
                const def = variants.find(v => v.isDefault) ?? variants[0]
                const isRaw = def?.inputs.length === 0
                const isBundled = !!bundledCatalog[pid]
                const active = productId === pid
                return (
                  <div
                    key={pid}
                    onClick={() => handleProductChange(pid)}
                    title={isRaw ? 'raw / leaf' : def?.inputs.join(', ')}
                    style={{
                      padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                      background: active ? '#2a4a7f' : 'transparent',
                      color: active ? '#e0e0ff' : '#c0c0d0',
                      fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {def?.label ?? pid}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 9, color: isBundled ? '#606080' : '#60a0e0' }}>
                      {isRaw ? 'raw' : `${def?.inputs.length ?? 0}in`}
                      {!isBundled && ' ★'}
                      {variants.length > 1 && ` ·${variants.length}v`}
                    </span>
                  </div>
                )
              })}
              {filteredProducts.length === 0 && (
                <div style={{ color: '#606080', fontSize: 12, padding: '6px 8px' }}>No matches</div>
              )}
            </div>
            <div style={{ color: '#404060', fontSize: 9 }}>★ = user-authored</div>
          </div>

          {/* Right: the authoring form */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        <div>
          <div style={labelStyle}>Product ID (resource type name)</div>
          <input
            list="product-list"
            value={productId}
            onChange={e => handleProductChange(e.target.value)}
            placeholder="e.g. my-alloy"
            style={inputStyle}
          />
          <datalist id="product-list">
            {allProducts.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>

        <div>
          <div style={labelStyle}>Display Label</div>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. My Alloy"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>Variant ID</div>
          <input
            value={variantId}
            onChange={e => setVariantId(e.target.value)}
            placeholder="default"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>Inputs (autocomplete an existing product, or create one — empty = raw/leaf)</div>
          {/* Ingredient chips */}
          {inputs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {inputs.map(id => {
                const known = allProducts.includes(id)
                return (
                  <span
                    key={id}
                    title={known ? id : `${id} (not in catalog yet)`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: '#0f1628', border: `1px solid ${known ? '#4a4a6a' : '#8060a0'}`,
                      borderRadius: 10, padding: '2px 5px 2px 9px', fontSize: 11.5, color: '#d8dcf0',
                    }}
                  >
                    {labelOf(id)}
                    {!known && <span style={{ color: '#a090c0', fontSize: 9 }}>new</span>}
                    <span
                      onClick={() => removeIngredient(id)}
                      title="Remove ingredient"
                      style={{ cursor: 'pointer', color: '#8088a0', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
                    >×</span>
                  </span>
                )
              })}
            </div>
          )}
          {/* Add-ingredient autocomplete (forces a real product match) */}
          <input
            list="ingredient-list"
            value={ingredientDraft}
            onChange={e => setIngredientDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitIngredientDraft() } }}
            placeholder="Type to find a product, then Enter…"
            style={inputStyle}
          />
          <datalist id="ingredient-list">
            {allProducts.map(p => <option key={p} value={labelOf(p)} />)}
          </datalist>
          {/* Force-match feedback: matched product or a deliberate create escape. */}
          {ingredientDraft.trim() && (
            draftMatch ? (
              <button
                onClick={() => addIngredient(draftMatch)}
                style={{ marginTop: 6, padding: '5px 10px', background: '#2a4a7f', color: '#e0e0ff', border: '1px solid #4a9eff', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
              >
                Add “{labelOf(draftMatch)}”
              </button>
            ) : (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#c08080', fontSize: 11 }}>No match.</span>
                <button
                  onClick={createIngredient}
                  style={{ padding: '5px 10px', background: '#3a2f4a', color: '#e0d0ff', border: '1px solid #8060a0', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                >
                  Create “{ingredientDraft.trim()}”
                </button>
              </div>
            )
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="isDefault"
            checked={isDefault}
            onChange={e => setIsDefault(e.target.checked)}
          />
          <label htmlFor="isDefault" style={{ color: '#c0c0d0', fontSize: 13 }}>Default variant for this product</label>
        </div>

        {saved && (
          <div style={{ color: '#60e060', fontSize: 12 }}>Saved!</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <button
            onClick={handleDelete}
            disabled={!productId.trim()}
            style={{ padding: '6px 12px', background: '#4a1a1a', color: '#e06060', border: '1px solid #6a2a2a', borderRadius: 4, cursor: productId.trim() ? 'pointer' : 'not-allowed', fontSize: 13 }}
          >
            Delete Variant
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '6px 14px', background: '#2a2a4a', color: '#e0e0ff', border: '1px solid #4a4a6a', borderRadius: 4, cursor: 'pointer' }}>Close</button>
            <button
              onClick={handleSave}
              disabled={!productId.trim()}
              style={{ padding: '6px 14px', background: productId.trim() ? '#4a9eff' : '#1a1a3a', color: productId.trim() ? '#000' : '#606080', border: 'none', borderRadius: 4, cursor: productId.trim() ? 'pointer' : 'not-allowed' }}
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
