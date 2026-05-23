import { create } from 'zustand'
import type { EditingState, ToolMode } from './tools'
import { defaultEditingState } from './tools'
import type { Point } from '../scene/types'

export interface EditingStore extends EditingState {
  /** Whether the Recipe Editor modal is open. */
  recipeEditorOpen: boolean
  /** Product to pre-fill in the Recipe Editor (null = author a new product). */
  recipeEditorProduct: string | null
  setTool: (tool: ToolMode) => void
  setPendingProduct: (productId: string | null, variantId: string | null) => void
  setPendingRailType: (resourceType: string | null) => void
  addDrawingPoint: (pt: Point) => void
  clearDrawingPoints: () => void
  setForkTarget: (target: { railId: string; t: number } | null) => void
  openRecipeEditor: (product?: string | null) => void
  closeRecipeEditor: () => void
  reset: () => void
}

export const useEditingStore = create<EditingStore>()((set) => ({
  ...defaultEditingState,
  recipeEditorOpen: false,
  recipeEditorProduct: null,

  setTool(tool) {
    set(() => ({ ...defaultEditingState, tool }))
  },

  setPendingProduct(productId, variantId) {
    set(() => ({ pendingProductId: productId, pendingVariantId: variantId }))
  },

  setPendingRailType(resourceType) {
    set(() => ({ pendingRailResourceType: resourceType }))
  },

  addDrawingPoint(pt) {
    set(state => ({ drawingPoints: [...state.drawingPoints, pt] }))
  },

  clearDrawingPoints() {
    set(() => ({ drawingPoints: [] }))
  },

  setForkTarget(target) {
    set(() => ({ forkTarget: target }))
  },

  openRecipeEditor(product = null) {
    set(() => ({ recipeEditorOpen: true, recipeEditorProduct: product }))
  },

  closeRecipeEditor() {
    set(() => ({ recipeEditorOpen: false, recipeEditorProduct: null }))
  },

  reset() {
    set(() => defaultEditingState)
  },
}))
