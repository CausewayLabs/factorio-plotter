/**
 * Shared viewport utilities — screen↔world coordinate transform.
 * These are pure functions (no React deps) so the solver and hit-testing
 * can both import them without pulling in rendering concerns.
 */

export interface Point {
  x: number
  y: number
}

export interface ViewportTransform {
  zoom: number
  pan: Point
}

export function screenToWorld(screen: Point, vt: ViewportTransform): Point {
  return {
    x: (screen.x - vt.pan.x) / vt.zoom,
    y: (screen.y - vt.pan.y) / vt.zoom,
  }
}

export function worldToScreen(world: Point, vt: ViewportTransform): Point {
  return {
    x: world.x * vt.zoom + vt.pan.x,
    y: world.y * vt.zoom + vt.pan.y,
  }
}

/** Clamp zoom to reasonable bounds */
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 5
export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}
