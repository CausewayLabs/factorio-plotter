import { create } from 'zustand'
import type { EditingState, ToolMode } from './tools'
import { defaultEditingState } from './tools'
import type { Point } from '../scene/types'

export interface EditingStore extends EditingState {
  /** Whether the Recipe Editor modal is open. */
  recipeEditorOpen: boolean
  /** Product to pre-fill in the Recipe Editor (null = author a new product). */
  recipeEditorProduct: string | null
  /** Whether the product picker modal is open (place-bubble flow). */
  productPickerOpen: boolean
  /** Whether the resource picker modal is open (draw-rail flow). */
  resourcePickerOpen: boolean
  /**
   * World position captured from a canvas double-click. When set, the next
   * picked product/rail is placed/seeded here instead of requiring a follow-up click.
   */
  pendingPlacePos: Point | null
  setTool: (tool: ToolMode) => void
  setPendingProduct: (productId: string | null, variantId: string | null) => void
  setPendingRailType: (resourceTypes: string[], label?: string | null) => void
  addDrawingPoint: (pt: Point) => void
  clearDrawingPoints: () => void
  setForkTarget: (target: { railId: string; t: number } | null) => void
  openRecipeEditor: (product?: string | null) => void
  closeRecipeEditor: () => void
  openProductPicker: (placePos?: Point | null) => void
  closeProductPicker: () => void
  openResourcePicker: (placePos?: Point | null) => void
  closeResourcePicker: () => void
  reset: () => void
}

export const useEditingStore = create<EditingStore>()((set) => ({
  ...defaultEditingState,
  recipeEditorOpen: false,
  recipeEditorProduct: null,
  productPickerOpen: false,
  resourcePickerOpen: false,
  pendingPlacePos: null,

  setTool(tool) {
    set(() => ({ ...defaultEditingState, tool }))
  },

  setPendingProduct(productId, variantId) {
    set(() => ({ pendingProductId: productId, pendingVariantId: variantId }))
  },

  setPendingRailType(resourceTypes, label = null) {
    set(() => ({ pendingRailResourceTypes: resourceTypes, pendingRailLabel: label }))
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

  openProductPicker(placePos = null) {
    set(() => ({ productPickerOpen: true, resourcePickerOpen: false, pendingPlacePos: placePos }))
  },

  closeProductPicker() {
    set(() => ({ productPickerOpen: false, pendingPlacePos: null }))
  },

  openResourcePicker(placePos = null) {
    set(() => ({ resourcePickerOpen: true, productPickerOpen: false, pendingPlacePos: placePos }))
  },

  closeResourcePicker() {
    set(() => ({ resourcePickerOpen: false, pendingPlacePos: null }))
  },

  reset() {
    set(() => defaultEditingState)
  },
}))
