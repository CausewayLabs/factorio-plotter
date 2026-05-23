/**
 * Product picker modal — choose a product + variant to place as a bubble.
 * Includes user-authored products.
 */
import { useState } from 'react'
import { useRecipeStore } from '../recipes/store'

interface Props {
  onSelect: (productId: string, variantId: string | null) => void
  onClose: () => void
}

export default function ProductPicker({ onSelect, onClose }: Props) {
  const getAllProductIds = useRecipeStore(s => s.getAllProductIds)
  const getVariantsForProduct = useRecipeStore(s => s.getVariantsForProduct)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null)

  const allProducts = getAllProductIds()
  const filtered = filter.trim()
    ? allProducts.filter(p => p.toLowerCase().includes(filter.toLowerCase()))
    : allProducts

  function handleSelect() {
    if (!selected) return
    onSelect(selected, selectedVariant)
  }

  const variants = selected ? getVariantsForProduct(selected) : []

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  const panelStyle: React.CSSProperties = {
    background: '#16213e', border: '1px solid #4a9eff', borderRadius: 8,
    padding: 20, minWidth: 340, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 10,
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#e0e0ff', margin: 0, fontSize: 15 }}>Choose Product</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#808080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <input
          autoFocus
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter products..."
          style={{ background: '#0f1628', border: '1px solid #4a4a6a', color: '#e0e0ff', borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
        />

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map(productId => {
            const v = getVariantsForProduct(productId)
            const label = v[0]?.label ?? productId
            const isRaw = v[0]?.inputs.length === 0
            return (
              <div
                key={productId}
                onClick={() => { setSelected(productId); setSelectedVariant(null) }}
                style={{
                  padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                  background: selected === productId ? '#2a4a7f' : 'transparent',
                  color: selected === productId ? '#e0e0ff' : '#c0c0d0',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 13,
                }}
              >
                <span>{label}</span>
                <span style={{ fontSize: 10, color: '#606080' }}>
                  {isRaw ? 'raw' : `${v[0]?.inputs.length ?? 0} inputs`}
                </span>
              </div>
            )
          })}
        </div>

        {/* Variant selector */}
        {selected && variants.length > 1 && (
          <div>
            <div style={{ color: '#8080c0', fontSize: 11, marginBottom: 4 }}>Recipe Variant:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {variants.map(v => (
                <button
                  key={v.variantId}
                  onClick={() => setSelectedVariant(v.variantId)}
                  style={{
                    background: (selectedVariant ?? 'default') === v.variantId ? '#4a9eff' : '#2a2a4a',
                    color: (selectedVariant ?? 'default') === v.variantId ? '#000' : '#e0e0ff',
                    border: '1px solid #4a4a6a', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

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
