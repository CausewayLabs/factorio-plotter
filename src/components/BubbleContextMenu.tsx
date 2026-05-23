/**
 * Context menu that appears when a bubble is right-clicked (or clicked in select mode).
 * Allows: recipe variant selection, private toggle, delete.
 */
import { useSceneStore } from '../scene/store'
import { useRecipeStore } from '../recipes/store'
import type { Bubble } from '../scene/types'

interface Props {
  bubble: Bubble
  screenPos: { x: number; y: number }
  onClose: () => void
  onOpenRecipeEditor: () => void
}

export default function BubbleContextMenu({ bubble, screenPos, onClose, onOpenRecipeEditor }: Props) {
  const setBubbleRecipeVariant = useSceneStore(s => s.setBubbleRecipeVariant)
  const setBubblePrivate = useSceneStore(s => s.setBubblePrivate)
  const deleteBubble = useSceneStore(s => s.deleteBubble)
  const getVariantsForProduct = useRecipeStore(s => s.getVariantsForProduct)

  const variants = getVariantsForProduct(bubble.productId)
  const currentVariantId = bubble.recipeVariantId

  function handleVariantSelect(variantId: string) {
    setBubbleRecipeVariant(bubble.id, variantId)
    onClose()
  }

  function handleTogglePrivate() {
    setBubblePrivate(bubble.id, !bubble.isPrivate)
    onClose()
  }

  function handleDelete() {
    deleteBubble(bubble.id)
    onClose()
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: screenPos.y,
    left: screenPos.x,
    background: '#16213e',
    border: '1px solid #4a4a6a',
    borderRadius: 6,
    padding: '6px 0',
    zIndex: 300,
    minWidth: 200,
    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
  }

  const itemStyle: React.CSSProperties = {
    padding: '5px 14px',
    cursor: 'pointer',
    color: '#c0c0d0',
    fontSize: 13,
  }

  const sectionStyle: React.CSSProperties = {
    padding: '2px 14px',
    color: '#606080',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  }

  const divStyle: React.CSSProperties = {
    height: 1,
    background: '#2a2a4a',
    margin: '4px 0',
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={onClose} />
      <div style={menuStyle} onClick={e => e.stopPropagation()}>
        <div style={sectionStyle}>Recipe Variant</div>
        {variants.map(v => (
          <div
            key={v.variantId}
            style={{
              ...itemStyle,
              background: (currentVariantId ?? 'default') === v.variantId ? '#2a4a7f' : 'transparent',
              color: (currentVariantId ?? 'default') === v.variantId ? '#e0e0ff' : '#c0c0d0',
            }}
            onClick={() => handleVariantSelect(v.variantId)}
          >
            {v.label}
            {v.isDefault && <span style={{ color: '#606080', fontSize: 10 }}> (default)</span>}
          </div>
        ))}

        <div style={divStyle} />

        <div style={itemStyle} onClick={handleTogglePrivate}>
          {bubble.isPrivate ? 'Make Public' : 'Make Private'}
        </div>

        <div style={itemStyle} onClick={onOpenRecipeEditor}>
          Edit Recipe...
        </div>

        <div style={divStyle} />

        <div
          style={{ ...itemStyle, color: '#e06060' }}
          onClick={handleDelete}
        >
          Delete Bubble
        </div>
      </div>
    </>
  )
}
