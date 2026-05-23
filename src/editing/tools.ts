/**
 * Editing tool modes for the canvas.
 * Only one tool is active at a time.
 */

export type ToolMode =
  | 'select'       // Default: pan canvas, select/drag entities
  | 'place-bubble' // Click to place a bubble (product picker shown)
  | 'draw-rail'    // Click to lay rail polyline vertices, double-click to finish
  | 'fork-rail'    // Click on a rail to start a T-fork from that point

export interface EditingState {
  tool: ToolMode
  /** For place-bubble: the product to place */
  pendingProductId: string | null
  /** For place-bubble: the recipe variant to use (null = default) */
  pendingVariantId: string | null
  /** For draw-rail: the resource type of the rail being drawn */
  pendingRailResourceType: string | null
  /** For draw-rail: points collected so far (world coords) */
  drawingPoints: { x: number; y: number }[]
  /** For fork-rail: the rail being forked and t value */
  forkTarget: { railId: string; t: number } | null
}

export const defaultEditingState: EditingState = {
  tool: 'select',
  pendingProductId: null,
  pendingVariantId: null,
  pendingRailResourceType: null,
  drawingPoints: [],
  forkTarget: null,
}
