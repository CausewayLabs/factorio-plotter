import { create } from 'zustand'
import type { EditingState, ToolMode } from './tools'
import { defaultEditingState } from './tools'
import type { Point } from '../scene/types'

export interface EditingStore extends EditingState {
  /** Whether the Recipe Editor modal is open. */
  recipeEditorOpen: boolean
  /** Recipe id to pre-fill in the Recipe Editor (null = author a new recipe). */
  recipeEditorRecipeId: string | null
  /** Whether the recipe picker modal is open (place-bubble flow). */
  productPickerOpen: boolean
  /** Whether the resource picker modal is open (draw-rail flow). */
  resourcePickerOpen: boolean
  /**
   * World position captured from a canvas double-click. When set, the next
   * picked recipe/rail is placed/seeded here instead of requiring a follow-up click.
   */
  pendingPlacePos: Point | null
  setTool: (tool: ToolMode) => void
  setPendingRecipe: (recipeId: string | null) => void
  setPendingRailType: (resourceTypes: string[], label?: string | null) => void
  addDrawingPoint: (pt: Point) => void
  popDrawingPoint: () => void
  clearDrawingPoints: () => void
  setForkTarget: (target: { railId: string; t: number } | null) => void
  openRecipeEditor: (recipeId?: string | null) => void
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
  recipeEditorRecipeId: null,
  productPickerOpen: false,
  resourcePickerOpen: false,
  pendingPlacePos: null,

  setTool(tool) {
    set(() => ({ ...defaultEditingState, tool }))
  },

  setPendingRecipe(recipeId) {
    set(() => ({ pendingRecipeId: recipeId }))
  },

  setPendingRailType(resourceTypes, label = null) {
    set(() => ({ pendingRailResourceTypes: resourceTypes, pendingRailLabel: label }))
  },

  addDrawingPoint(pt) {
    set(state => ({ drawingPoints: [...state.drawingPoints, pt] }))
  },

  popDrawingPoint() {
    set(state => ({ drawingPoints: state.drawingPoints.slice(0, -1) }))
  },

  clearDrawingPoints() {
    set(() => ({ drawingPoints: [] }))
  },

  setForkTarget(target) {
    set(() => ({ forkTarget: target }))
  },

  openRecipeEditor(recipeId = null) {
    set(() => ({ recipeEditorOpen: true, recipeEditorRecipeId: recipeId }))
  },

  closeRecipeEditor() {
    set(() => ({ recipeEditorOpen: false, recipeEditorRecipeId: null }))
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
