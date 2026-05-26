import { useEffect } from 'react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import RecipeEditor from './components/RecipeEditor'
import ProductPicker from './components/ProductPicker'
import ResourcePicker from './components/ResourcePicker'
import { useSceneStore, generateId } from './scene/store'
import { useEditingStore } from './editing/store'
import { useRecipeStore } from './recipes/store'
import { loadAutosave, autosave } from './editing/persistence'
import { triggerManualRecompute } from './solver/reactivity'
import type { Bubble } from './scene/types'

/**
 * App shell. On startup loads the autosaved diagram from localStorage.
 * If no autosave, canvas starts empty.
 *
 * The recipe/resource pickers are rendered here (not in the Toolbar) so their
 * fixed-position overlays are not trapped inside the toolbar's CSS transform.
 */
function App() {
  const addBubble = useSceneStore(s => s.addBubble)
  const addRail = useSceneStore(s => s.addRail)
  const bubbles = useSceneStore(s => s.bubbles)
  const rails = useSceneStore(s => s.rails)

  const recipeEditorOpen = useEditingStore(s => s.recipeEditorOpen)
  const recipeEditorRecipeId = useEditingStore(s => s.recipeEditorRecipeId)
  const closeRecipeEditor = useEditingStore(s => s.closeRecipeEditor)

  const productPickerOpen = useEditingStore(s => s.productPickerOpen)
  const resourcePickerOpen = useEditingStore(s => s.resourcePickerOpen)
  const pendingPlacePos = useEditingStore(s => s.pendingPlacePos)
  const closeProductPicker = useEditingStore(s => s.closeProductPicker)
  const closeResourcePicker = useEditingStore(s => s.closeResourcePicker)
  const setTool = useEditingStore(s => s.setTool)
  const setPendingRecipe = useEditingStore(s => s.setPendingRecipe)
  const setPendingRailType = useEditingStore(s => s.setPendingRailType)
  const addDrawingPoint = useEditingStore(s => s.addDrawingPoint)

  const getRecipeById = useRecipeStore(s => s.getRecipeById)

  // Recipe chosen: if a double-click position was captured, place the bubble
  // there immediately; otherwise arm place-bubble mode for a follow-up click.
  // NOTE: setTool resets pending fields, so it must precede setPendingRecipe.
  function handleRecipeSelected(recipeId: string) {
    const placePos = pendingPlacePos
    closeProductPicker()

    const recipe = getRecipeById(recipeId)
    // Initialize outputBindings: one null entry per product in the recipe
    const outputBindings: Record<string, string | null> = {}
    for (const p of recipe?.products ?? []) outputBindings[p] = null

    if (placePos) {
      const bubble: Bubble = {
        id: generateId(),
        position: placePos,
        recipeId,
        isPrivate: false,
        outputBindings,
      }
      addBubble(bubble)
      autosave({ ...bubbles, [bubble.id]: bubble }, rails)
      setTool('select')
    } else {
      setTool('place-bubble')
      setPendingRecipe(recipeId)
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

  const getMergedMap = useRecipeStore(s => s.getMergedMap)

  useEffect(() => {
    // Only load autosave if store is empty (first mount)
    if (Object.keys(bubbles).length > 0) return

    const recipeMap = getMergedMap()
    const saved = loadAutosave(recipeMap)
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
          editRecipeId={recipeEditorRecipeId ?? undefined}
          onClose={closeRecipeEditor}
        />
      )}
      {productPickerOpen && (
        <ProductPicker
          onSelect={handleRecipeSelected}
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
