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
import { BUBBLE_RADIUS, bubbleOutputPort } from '../scene/geometry'
import { resolveRailPolyline } from '../scene/geometry'

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
    // Resolve fork origin so the hit geometry matches what's drawn.
    const pts = resolveRailPolyline(rail, rails)

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

export interface EndpointHit {
  railId: string
  /** Index into the rail's stored `points` of the dragged endpoint. */
  endIndex: number
  /** Resolved world position of the endpoint (handle center). */
  point: Point
}

const ENDPOINT_HIT_THRESHOLD_SCREEN = 12 // pixels

/**
 * Hit-test a screen point against rail endpoints (the draggable handles).
 * Returns the nearest endpoint within threshold, or null.
 *
 * A fork's first point is parametric (owned by its parent), so it is NOT an
 * adjustable handle — only free vertices (non-fork ends, and any last point)
 * are returned.
 */
export function hitTestRailEndpoint(
  screenPt: Point,
  viewport: ViewportTransform,
  rails: Record<string, Rail>
): EndpointHit | null {
  const worldPt = screenToWorld(screenPt, viewport)
  const thresholdWorld = ENDPOINT_HIT_THRESHOLD_SCREEN / viewport.zoom
  let best: EndpointHit | null = null
  let bestDistSq = thresholdWorld * thresholdWorld

  for (const rail of Object.values(rails)) {
    const pts = resolveRailPolyline(rail, rails)
    if (pts.length < 2) continue

    // The first point is only an adjustable handle when it isn't a fork origin
    // (a fork's parent owns it). Rails are never anchored to bubbles.
    const anchoredStart = rail.parametricOrigin !== null
    const candidates: number[] = anchoredStart ? [pts.length - 1] : [0, pts.length - 1]
    for (const endIndex of candidates) {
      const p = pts[endIndex]
      const dx = worldPt.x - p.x
      const dy = worldPt.y - p.y
      const distSq = dx * dx + dy * dy
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        best = { railId: rail.id, endIndex, point: p }
      }
    }
  }

  return best
}

/**
 * Hit-test a screen point against bubble output ports (the branch-a-bus handle).
 * Returns the bubble id whose output dot is within threshold, or null. Checked
 * before the bubble body so dragging the dot pulls a bus while dragging the body
 * relocates the bubble.
 */
const OUTPUT_PORT_HIT_THRESHOLD_SCREEN = 11 // pixels

export function hitTestBubbleOutputPort(
  screenPt: Point,
  viewport: ViewportTransform,
  bubbles: Record<string, Bubble>
): string | null {
  const worldPt = screenToWorld(screenPt, viewport)
  const thresholdWorld = OUTPUT_PORT_HIT_THRESHOLD_SCREEN / viewport.zoom
  const tSq = thresholdWorld * thresholdWorld
  let best: string | null = null
  let bestDistSq = tSq
  for (const bubble of Object.values(bubbles)) {
    const port = bubbleOutputPort(bubble.position)
    const dx = worldPt.x - port.x
    const dy = worldPt.y - port.y
    const distSq = dx * dx + dy * dy
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      best = bubble.id
    }
  }
  return best
}
