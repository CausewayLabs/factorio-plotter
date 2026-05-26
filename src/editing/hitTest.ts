/**
 * Hit-testing utilities for the editing subsystem.
 *
 * Rules:
 * - Feeders are NEVER hit-testable (authored/derived boundary invariant).
 * - Bubbles are hit by radius test on their center.
 * - Rails are hit by nearest-point distance on their polyline.
 * - Uses screen↔world transform from the viewport.
 */

import type { Point, InputSlot, OutputSlot } from '../scene/types'
import type { Bubble, Rail } from '../scene/types'
import type { ViewportTransform } from '../scene/types'
import { screenToWorld } from '../scene/viewport'
import { nearestPointOnPolyline } from '../scene/geometry'
import { BUBBLE_RADIUS, bubbleInputBox } from '../scene/geometry'
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
 * Hit-test a screen point against bubble output tabs (the per-product emit
 * handles). Returns the specific bubble+product whose tab box contains the
 * point, plus the tab's outer port (where the connector originates). Checked
 * before the bubble body so dragging a tab emits its product onto a bus while
 * dragging the body relocates the bubble.
 */
export interface OutputTabHit {
  bubbleId: string
  productId: string
  port: Point
}

/** Must stay in sync with the chevron extent in BubbleLayer's output-tab render. */
const OUTPUT_TAB_TIP_EXT = 8

export function hitTestBubbleOutputTab(
  screenPt: Point,
  viewport: ViewportTransform,
  bubbles: Record<string, Bubble>,
  outputLayouts: Record<string, OutputSlot[]>
): OutputTabHit | null {
  const worldPt = screenToWorld(screenPt, viewport)
  for (const bubble of Object.values(bubbles)) {
    const slots = outputLayouts[bubble.id]
    if (!slots || slots.length === 0) continue
    for (const slot of slots) {
      const box = bubbleInputBox(bubble.position, slot.side, slot.sideIndex, slot.sideTotal)
      // Expand bbox by the chevron tip extension on the outer side so the
      // pentagon's pointed tip is hittable.
      const left = slot.side === 'right' ? box.x : box.x - OUTPUT_TAB_TIP_EXT
      const right = slot.side === 'right' ? box.x + box.width + OUTPUT_TAB_TIP_EXT : box.x + box.width
      if (
        worldPt.x >= left &&
        worldPt.x <= right &&
        worldPt.y >= box.y &&
        worldPt.y <= box.y + box.height
      ) {
        // Tip of the chevron is the emit port (origin of the output connector).
        const tipX =
          slot.side === 'right' ? box.x + box.width + OUTPUT_TAB_TIP_EXT : box.x - OUTPUT_TAB_TIP_EXT
        return {
          bubbleId: bubble.id,
          productId: slot.productId,
          port: { x: tipX, y: box.centerY },
        }
      }
    }
  }
  return null
}

/**
 * Hit-test against unsatisfied input tabs. Dragging from one of these is the
 * "fill missing input" gesture: it spawns a producer bubble at the drop point.
 * Satisfied input tabs are inert — the solver already wired them via a feeder.
 */
export interface InputTabHit {
  bubbleId: string
  resourceType: string
  port: Point
}

export function hitTestUnsatisfiedInputTab(
  screenPt: Point,
  viewport: ViewportTransform,
  bubbles: Record<string, Bubble>,
  inputLayouts: Record<string, InputSlot[]>
): InputTabHit | null {
  const worldPt = screenToWorld(screenPt, viewport)
  for (const bubble of Object.values(bubbles)) {
    const slots = inputLayouts[bubble.id]
    if (!slots || slots.length === 0) continue
    for (const slot of slots) {
      if (slot.satisfied) continue
      const box = bubbleInputBox(bubble.position, slot.side, slot.sideIndex, slot.sideTotal)
      if (
        worldPt.x >= box.x &&
        worldPt.x <= box.x + box.width &&
        worldPt.y >= box.y &&
        worldPt.y <= box.y + box.height
      ) {
        return { bubbleId: bubble.id, resourceType: slot.resourceType, port: box.port }
      }
    }
  }
  return null
}
