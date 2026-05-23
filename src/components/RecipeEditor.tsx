/**
 * Recipe Editor — create/edit user-authored products and recipes.
 * Writes into the user-set Zustand store (persisted to localStorage).
 * Opens as a modal panel.
 */
import { useState } from 'react'
import { useRecipeStore } from '../recipes/store'
import type { RecipeVariant } from '../recipes/types'

interface Props {
  onClose: () => void
  /** Pre-fill editing an existing product */
  editProduct?: string
}

export default function RecipeEditor({ onClose, editProduct }: Props) {
  const upsertVariant = useRecipeStore(s => s.upsertVariant)
  const removeVariant = useRecipeStore(s => s.removeVariant)
  const getVariantsForProduct = useRecipeStore(s => s.getVariantsForProduct)
  const getAllProductIds = useRecipeStore(s => s.getAllProductIds)

  const [productId, setProductId] = useState(editProduct ?? '')
  const [variantId, setVariantId] = useState('default')
  const [label, setLabel] = useState('')
  const [inputsText, setInputsText] = useState('')
  const [isDefault, setIsDefault] = useState(true)
  const [saved, setSaved] = useState(false)

  // When productId changes, try to fill from existing variant
  function handleProductChange(pid: string) {
    setProductId(pid)
    setSaved(false)
    const variants = getVariantsForProduct(pid)
    if (variants.length > 0) {
      const def = variants.find(v => v.isDefault) ?? variants[0]
      setVariantId(def.variantId)
      setLabel(def.label)
      setInputsText(def.inputs.join(', '))
      setIsDefault(def.isDefault)
    } else {
      setLabel('')
      setInputsText('')
      setVariantId('default')
      setIsDefault(true)
    }
  }

  function handleSave() {
    if (!productId.trim()) return
    const inputs = inputsText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const variant: RecipeVariant = {
      product: productId.trim(),
      variantId: variantId.trim() || 'default',
      label: label.trim() || productId.trim(),
      inputs,
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
    setInputsText('')
    setSaved(false)
  }

  const allProducts = getAllProductIds()

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const panelStyle: React.CSSProperties = {
    background: '#16213e', border: '1px solid #4a9eff', borderRadius: 8,
    padding: 24, minWidth: 380, display: 'flex', flexDirection: 'column', gap: 14,
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
          <div style={labelStyle}>Inputs (comma-separated resource IDs, empty = raw/leaf)</div>
          <input
            value={inputsText}
            onChange={e => setInputsText(e.target.value)}
            placeholder="e.g. iron-plate, copper-plate"
            style={inputStyle}
          />
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
  )
}
