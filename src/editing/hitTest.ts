/**
 * Hit-testing utilities for the editing subsystem.
 *
 * Rules:
 * - Feeders are NEVER hit-testable (authored/derived boundary invariant).
 * - Bubbles are hit by radius test on their center.
 * - Rails are hit by nearest-point distance on their polyline.
 * - Uses screen↔world transform from the viewport.
 */

import type { Point } from '../scene/types'
import type { Bubble, Rail } from '../scene/types'
import type { ViewportTransform } from '../scene/types'
import { screenToWorld } from '../scene/viewport'
import { nearestPointOnPolyline } from '../scene/geometry'
import { BUBBLE_RADIUS } from '../scene/geometry'
import { resolveParametricPoint } from '../scene/geometry'

export interface HitResult {
  kind: 'bubble' | 'rail'
  id: string
  /** For rails: the nearest point on the rail polyline (world coords) */
  nearestPoint?: Point
  /** For rails: the parametric t value at the nearest point */
  nearestT?: number
}

const RAIL_HIT_THRESHOLD_SCREEN = 10 // pixels

/**
 * Hit-test a screen-space point against all authored entities.
 * Returns the topmost hit (bubbles checked first, then rails).
 * NEVER returns a feeder hit.
 */
export function hitTest(
  screenPt: Point,
  viewport: ViewportTransform,
  bubbles: Record<string, Bubble>,
  rails: Record<string, Rail>
): HitResult | null {
  const worldPt = screenToWorld(screenPt, viewport)

  // Check bubbles first (they are drawn on top of rails)
  for (const bubble of Object.values(bubbles)) {
    const dx = worldPt.x - bubble.position.x
    const dy = worldPt.y - bubble.position.y
    if (dx * dx + dy * dy <= BUBBLE_RADIUS * BUBBLE_RADIUS) {
      return { kind: 'bubble', id: bubble.id }
    }
  }

  // Check rails — use screen-space threshold for consistent feel regardless of zoom
  const railThresholdWorld = RAIL_HIT_THRESHOLD_SCREEN / viewport.zoom
  let bestRail: HitResult | null = null
  let bestDistSq = railThresholdWorld * railThresholdWorld

  for (const rail of Object.values(rails)) {
    // Resolve fork origin if needed
    let pts = rail.points
    if (rail.parametricOrigin) {
      const parentRail = rails[rail.parametricOrigin.parentRailId]
      if (parentRail) {
        const forkPoint = resolveParametricPoint(parentRail, rail.parametricOrigin.t)
        pts = [forkPoint, ...rail.points.slice(1)]
      }
    }

    const { point, t, distSq } = nearestPointOnPolyline(pts, worldPt)
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestRail = {
        kind: 'rail',
        id: rail.id,
        nearestPoint: point,
        nearestT: t,
      }
    }
  }

  return bestRail
}
