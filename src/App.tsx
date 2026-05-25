import { useEffect } from 'react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import RecipeEditor from './components/RecipeEditor'
import ProductPicker from './components/ProductPicker'
import ResourcePicker from './components/ResourcePicker'
import { useSceneStore, generateId } from './scene/store'
import { useEditingStore } from './editing/store'
import { loadAutosave, autosave } from './editing/persistence'
import { triggerManualRecompute } from './solver/reactivity'
import type { Bubble } from './scene/types'

/**
 * App shell. On startup loads the autosaved diagram from localStorage.
 * If no autosave, canvas starts empty.
 *
 * The product/resource pickers are rendered here (not in the Toolbar) so their
 * fixed-position overlays are not trapped inside the toolbar's CSS transform.
 */
function App() {
  const addBubble = useSceneStore(s => s.addBubble)
  const addRail = useSceneStore(s => s.addRail)
  const bubbles = useSceneStore(s => s.bubbles)
  const rails = useSceneStore(s => s.rails)

  const recipeEditorOpen = useEditingStore(s => s.recipeEditorOpen)
  const recipeEditorProduct = useEditingStore(s => s.recipeEditorProduct)
  const closeRecipeEditor = useEditingStore(s => s.closeRecipeEditor)

  const productPickerOpen = useEditingStore(s => s.productPickerOpen)
  const resourcePickerOpen = useEditingStore(s => s.resourcePickerOpen)
  const pendingPlacePos = useEditingStore(s => s.pendingPlacePos)
  const closeProductPicker = useEditingStore(s => s.closeProductPicker)
  const closeResourcePicker = useEditingStore(s => s.closeResourcePicker)
  const setTool = useEditingStore(s => s.setTool)
  const setPendingProduct = useEditingStore(s => s.setPendingProduct)
  const setPendingRailType = useEditingStore(s => s.setPendingRailType)
  const addDrawingPoint = useEditingStore(s => s.addDrawingPoint)

  // Product chosen: if a double-click position was captured, place the bubble
  // there immediately; otherwise arm place-bubble mode for a follow-up click.
  // NOTE: setTool resets pending fields, so it must precede setPendingProduct.
  function handleProductSelected(productId: string, variantId: string | null) {
    const placePos = pendingPlacePos
    closeProductPicker()
    if (placePos) {
      const bubble: Bubble = {
        id: generateId(),
        position: placePos,
        productId,
        recipeVariantId: variantId,
        isPrivate: false,
        outputTarget: null,
      }
      addBubble(bubble)
      autosave({ ...bubbles, [bubble.id]: bubble }, rails)
      setTool('select')
    } else {
      setTool('place-bubble')
      setPendingProduct(productId, variantId)
    }
  }

  // Resource (or multi-resource bus preset) chosen: enter draw-rail mode. If a
  // double-click position was captured, seed it as the rail's first vertex.
  // NOTE: setTool resets pending fields, so it must precede setPendingRailType.
  function handleResourceSelected(resourceTypes: string[], label?: string | null) {
    const seed = pendingPlacePos
    closeResourcePicker()
    setTool('draw-rail')
    setPendingRailType(resourceTypes, label ?? null)
    if (seed) addDrawingPoint(seed)
  }

  useEffect(() => {
    // Only load autosave if store is empty (first mount)
    if (Object.keys(bubbles).length > 0) return

    const saved = loadAutosave()
    if (saved) {
      saved.bubbles.forEach(b => addBubble(b))
      saved.rails.forEach(r => addRail(r))
      triggerManualRecompute()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <Canvas />
      <Toolbar />
      {recipeEditorOpen && (
        <RecipeEditor
          editProduct={recipeEditorProduct ?? undefined}
          onClose={closeRecipeEditor}
        />
      )}
      {productPickerOpen && (
        <ProductPicker
          onSelect={handleProductSelected}
          onClose={closeProductPicker}
        />
      )}
      {resourcePickerOpen && (
        <ResourcePicker
          onSelect={handleResourceSelected}
          onClose={closeResourcePicker}
        />
      )}
    </div>
  )
}

export default App
