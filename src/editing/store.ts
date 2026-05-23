import { create } from 'zustand'
import type { EditingState, ToolMode } from './tools'
import { defaultEditingState } from './tools'
import type { Point } from '../scene/types'

export interface EditingStore extends EditingState {
  setTool: (tool: ToolMode) => void
  setPendingProduct: (productId: string | null, variantId: string | null) => void
  setPendingRailType: (resourceType: string | null) => void
  addDrawingPoint: (pt: Point) => void
  clearDrawingPoints: () => void
  setForkTarget: (target: { railId: string; t: number } | null) => void
  reset: () => void
}

export const useEditingStore = create<EditingStore>()((set) => ({
  ...defaultEditingState,

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

  reset() {
    set(() => defaultEditingState)
  },
}))
