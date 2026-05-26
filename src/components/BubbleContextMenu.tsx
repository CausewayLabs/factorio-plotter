/**
 * Context menu that appears when a bubble is right-clicked (or clicked in select mode).
 * Allows: recipe selection, per-product output binding, private toggle, delete.
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
  const setBubbleRecipe = useSceneStore(s => s.setBubbleRecipe)
  const setOutputBinding = useSceneStore(s => s.setOutputBinding)
  const setBubblePrivate = useSceneStore(s => s.setBubblePrivate)
  const deleteBubble = useSceneStore(s => s.deleteBubble)
  const getRecipeById = useRecipeStore(s => s.getRecipeById)
  const getRecipesForProduct = useRecipeStore(s => s.getRecipesForProduct)

  const recipe = getRecipeById(bubble.recipeId)
  const primaryProduct = recipe?.products[0] ?? null

  // Alternate recipes for the primary product (allows recipe switching)
  const alternates = primaryProduct ? getRecipesForProduct(primaryProduct) : []

  function handleRecipeSelect(recipeId: string) {
    const newRecipe = getRecipeById(recipeId)
    if (!newRecipe) return
    // Reinitialize outputBindings for the new recipe's products (null = unbound)
    const newBindings: Record<string, string | null> = {}
    for (const p of newRecipe.products) newBindings[p] = null
    setBubbleRecipe(bubble.id, recipeId, newBindings)
    onClose()
  }

  function handleUnbindProduct(productId: string) {
    setOutputBinding(bubble.id, productId, null)
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

  // Bound output slots
  const boundEntries = Object.entries(bubble.outputBindings).filter(([, rId]) => rId !== null)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={onClose} />
      <div style={menuStyle} onClick={e => e.stopPropagation()}>

        {/* Recipe selection (alternate recipes for same primary product) */}
        {alternates.length > 1 && (
          <>
            <div style={sectionStyle}>Recipe</div>
            {alternates.map(r => (
              <div
                key={r.id}
                style={{
                  ...itemStyle,
                  background: bubble.recipeId === r.id ? '#2a4a7f' : 'transparent',
                  color: bubble.recipeId === r.id ? '#e0e0ff' : '#c0c0d0',
                }}
                onClick={() => handleRecipeSelect(r.id)}
              >
                {r.label}
                {r.id === alternates[0].id && (
                  <span style={{ color: '#606080', fontSize: 10 }}> (default)</span>
                )}
              </div>
            ))}
            <div style={divStyle} />
          </>
        )}

        {/* Output binding summary — unbind actions */}
        {boundEntries.length > 0 && (
          <>
            <div style={sectionStyle}>Output Bindings</div>
            {boundEntries.map(([productId]) => (
              <div
                key={productId}
                style={{ ...itemStyle, color: '#a0c8ff' }}
                onClick={() => handleUnbindProduct(productId)}
              >
                Unbind {productId}
              </div>
            ))}
            <div style={divStyle} />
          </>
        )}

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
