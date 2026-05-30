/**
 * Resource type picker — choose a resource type for a new rail.
 * Includes all known product IDs (which are also resource type names).
 */
import { useState } from 'react'
import { useRecipeStore } from '../recipes/store'
import { SOURCE_PRESETS } from '../recipes/sources'

interface Props {
  /** Called with the resource type set the rail/bus carries, plus an optional label. */
  onSelect: (resourceTypes: string[], label?: string) => void
  onClose: () => void
}

export default function ResourcePicker({ onSelect, onClose }: Props) {
  const getAllProductIds = useRecipeStore(s => s.getAllProductIds)
  const getRecipesForProduct = useRecipeStore(s => s.getRecipesForProduct)
  const [filter, setFilter] = useState('')
  const [customType, setCustomType] = useState('')
  const [highlight, setHighlight] = useState(0)

  const allProducts = getAllProductIds()
  const filtered = filter.trim()
    ? allProducts.filter(p => p.toLowerCase().includes(filter.toLowerCase()))
    : allProducts

  // Keyboard nav from the filter box: ↑/↓ move highlight, Enter picks it
  // (or creates the custom resource if the filter matches nothing).
  function handleFilterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[highlight]
      if (pick) onSelect([pick])
      else if (customType.trim()) onSelect([customType.trim()])
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
    padding: 20, minWidth: 320, maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: 10,
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#e0e0ff', margin: 0, fontSize: 15 }}>Bus Resource</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#808080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {/* Multi-resource source presets (e.g. Fulgora scrap recycling bus) */}
        <div>
          <div style={{ color: '#8080c0', fontSize: 11, marginBottom: 4 }}>Source buses (multi-resource):</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SOURCE_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => onSelect(preset.resourceTypes, preset.label)}
                title={preset.resourceTypes.join(', ')}
                style={{ padding: '5px 10px', background: '#3a2f4a', color: '#e0d0ff', border: '1px solid #8060a0', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
              >
                {preset.label} bus <span style={{ color: '#a090c0', fontSize: 10 }}>({preset.resourceTypes.length})</span>
              </button>
            ))}
          </div>
        </div>

        <input
          autoFocus
          value={filter}
          onChange={e => { setFilter(e.target.value); setCustomType(e.target.value); setHighlight(0) }}
          onKeyDown={handleFilterKeyDown}
          placeholder="Filter or type custom resource... (↑/↓ + Enter)"
          style={{ background: '#0f1628', border: '1px solid #4a4a6a', color: '#e0e0ff', borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
        />

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map((productId, i) => {
            const recipes = getRecipesForProduct(productId)
            const label = recipes[0]?.label ?? productId
            const isActive = i === highlight
            return (
              <div
                key={productId}
                onClick={() => onSelect([productId])}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                  background: isActive ? '#2a4a7f' : 'transparent',
                  color: isActive ? '#e0e0ff' : '#c0c0d0',
                  fontSize: 13,
                  display: 'flex', justifyContent: 'space-between',
                }}
              >
                <span>{label}</span>
                <span style={{ color: '#606080', fontSize: 10 }}>{productId}</span>
              </div>
            )
          })}
        </div>

        {/* Custom resource type */}
        {customType.trim() && !allProducts.includes(customType.trim()) && (
          <div>
            <div style={{ color: '#8080c0', fontSize: 11, marginBottom: 4 }}>Create custom resource:</div>
            <button
              onClick={() => onSelect([customType.trim()])}
              style={{ width: '100%', padding: '6px 12px', background: '#2a4a7f', color: '#e0e0ff', border: '1px solid #4a9eff', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
            >
              Use "{customType.trim()}"
            </button>
          </div>
        )}

        <button onClick={onClose} style={{ padding: '6px 14px', background: '#2a2a4a', color: '#e0e0ff', border: '1px solid #4a4a6a', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-end' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
