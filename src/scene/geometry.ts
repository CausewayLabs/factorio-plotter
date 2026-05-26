/**
 * Geometry helpers for bubble port positions, rail hit geometry, etc.
 */
import type { Point } from './types'
import type { Rail, InputSide } from './types'

export const BUBBLE_RADIUS = 36
export const BUBBLE_OUTPUT_PORT_OFFSET = BUBBLE_RADIUS // right edge
export const INPUT_PORT_RADIUS = 5

/**
 * How far an output tab's chevron tip extends past the rectangular tab edge.
 * Shared by the renderer (BubbleLayer), hit-tester (hitTest), and solver
 * (so output connectors originate at the visible chevron tip).
 */
export const OUTPUT_TAB_TIP_EXT = 8

/**
 * Compute the chevron-tip emit port for an output tab. The tip sits on the
 * outer side of `box` (right tab → tip is to the right of the rectangle;
 * left tab → tip is to the left).
 */
export function outputTabTip(box: { x: number; width: number; centerY: number; side: InputSide }): Point {
  const x = box.side === 'right' ? box.x + box.width + OUTPUT_TAB_TIP_EXT : box.x - OUTPUT_TAB_TIP_EXT
  return { x, y: box.centerY }
}

// --- Input box layout ---
// Each recipe input is drawn as a rectangular tab on the left of the bubble.
// Tabs stack vertically AND stagger further left with each index, so the
// vertical feeder drops (which land on each tab's left edge) never overlap.
export const INPUT_BOX_HEIGHT = 18
export const INPUT_BOX_VGAP = 6
export const INPUT_BOX_BASE_WIDTH = 92
export const INPUT_BOX_STAGGER = 22
export const INPUT_BOX_LEAD = 12 // gap between a tab's right edge and the circle's leftmost x

export interface InputBoxGeometry {
  /** Left edge x. */
  x: number
  /** Top edge y. */
  y: number
  width: number
  height: number
  /** Vertical center of the box. */
  centerY: number
  /** Edge x toward the bubble (right edge for left-side tabs, left edge for right-side). */
  innerX: number
  /** Feeder attach point — outer-edge center (left edge for left tabs, right edge for right). */
  port: Point
  /** Which side of the bubble this tab sits on. */
  side: InputSide
}

/**
 * The output port of a bubble is at its right edge center.
 */
export function bubbleOutputPort(center: Point): Point {
  return { x: center.x + BUBBLE_RADIUS, y: center.y }
}

/**
 * Geometry of input box `index` of `total` on a given `side`.
 * Boxes on each side are stacked vertically (centered on the bubble) and each
 * successive box is wider — staggering outward from the bubble so the feeder
 * drop points (the outer-edge `port`) never overlap. Left-side tabs stagger
 * left and attach on their left edge; right-side tabs mirror this.
 */
export function bubbleInputBox(
  center: Point,
  side: InputSide,
  index: number,
  total: number
): InputBoxGeometry {
  const n = Math.max(total, 1)
  const pitch = INPUT_BOX_HEIGHT + INPUT_BOX_VGAP
  const stackHeight = n * INPUT_BOX_HEIGHT + (n - 1) * INPUT_BOX_VGAP
  const firstCenterY = center.y - stackHeight / 2 + INPUT_BOX_HEIGHT / 2
  const centerY = firstCenterY + index * pitch
  const width = INPUT_BOX_BASE_WIDTH + index * INPUT_BOX_STAGGER

  if (side === 'left') {
    const innerX = center.x - BUBBLE_RADIUS - INPUT_BOX_LEAD
    const x = innerX - width
    return {
      x,
      y: centerY - INPUT_BOX_HEIGHT / 2,
      width,
      height: INPUT_BOX_HEIGHT,
      centerY,
      innerX,
      port: { x, y: centerY },
      side,
    }
  }

  // Right side: mirror of the left layout.
  const innerX = center.x + BUBBLE_RADIUS + INPUT_BOX_LEAD
  const x = innerX
  const outerX = innerX + width
  return {
    x,
    y: centerY - INPUT_BOX_HEIGHT / 2,
    width,
    height: INPUT_BOX_HEIGHT,
    centerY,
    innerX,
    port: { x: outerX, y: centerY },
    side,
  }
}

/**
 * Input ports (feeder attach points) are the outer-edge center of each input
 * box. Single source of truth shared by the renderer and the solver, so feeders
 * always terminate exactly at the rendered tab.
 */
export function bubbleInputPort(center: Point, side: InputSide, index: number, total: number): Point {
  return bubbleInputBox(center, side, index, total).port
}

/**
 * Assign each item a per-side index and that side's total, preserving input
 * order within each side. Shared by the solver (real sides) and the renderer's
 * fallback (all-left) so tab indexing is computed in exactly one place.
 */
export function assignSideIndices<T extends { side: InputSide }>(
  items: T[]
): (T & { sideIndex: number; sideTotal: number })[] {
  const leftTotal = items.reduce((n, it) => (it.side === 'left' ? n + 1 : n), 0)
  const rightTotal = items.length - leftTotal
  let li = 0
  let ri = 0
  return items.map(it =>
    it.side === 'left'
      ? { ...it, sideIndex: li++, sideTotal: leftTotal }
      : { ...it, sideIndex: ri++, sideTotal: rightTotal }
  )
}

/**
 * Resolve a rail's world-space polyline, substituting a fork's first point with
 * the live point on its parent (parametric origin). Shared by hit-testing,
 * rendering, the solver, and endpoint editing so a fork's geometry is computed
 * one way everywhere. Rails are never anchored to bubbles, so this depends only
 * on rails.
 */
export function resolveRailPolyline(
  rail: Rail,
  rails: Record<string, Rail>
): Point[] {
  // Fork origin: first point slides along the parent rail.
  if (rail.parametricOrigin) {
    const parent = rails[rail.parametricOrigin.parentRailId]
    if (!parent) return rail.points
    const forkPoint = resolveParametricPoint(parent, rail.parametricOrigin.t)
    return [forkPoint, ...rail.points.slice(1)]
  }
  return rail.points
}

/**
 * Orthogonal (90°) connector polyline from `from` to `to`. Leaves `from`
 * horizontally — matching a bubble output port's sideways emit — then turns once
 * to reach `to`. Collapses to a single straight segment when already
 * axis-aligned. Used for derived output connectors (bubble output → bus).
 */
export function orthogonalConnector(from: Point, to: Point): Point[] {
  if (from.x === to.x || from.y === to.y) return [from, to]
  return [from, { x: to.x, y: from.y }, to]
}

/**
 * Resolve the world-space point at parameter t along a rail polyline.
 * t=0 is first point, t=1 is last point; linear interpolation along segments.
 */
export function resolveParametricPoint(rail: Rail, t: number): Point {
  const pts = rail.points
  if (pts.length === 0) return { x: 0, y: 0 }
  if (pts.length === 1) return { ...pts[0] }

  // Compute total length and per-segment lengths
  const segLengths: number[] = []
  let totalLength = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x
    const dy = pts[i + 1].y - pts[i].y
    const len = Math.sqrt(dx * dx + dy * dy)
    segLengths.push(len)
    totalLength += len
  }

  if (totalLength === 0) return { ...pts[0] }

  const target = Math.max(0, Math.min(1, t)) * totalLength
  let accumulated = 0
  for (let i = 0; i < segLengths.length; i++) {
    if (accumulated + segLengths[i] >= target) {
      const local = (target - accumulated) / segLengths[i]
      return {
        x: pts[i].x + local * (pts[i + 1].x - pts[i].x),
        y: pts[i].y + local * (pts[i + 1].y - pts[i].y),
      }
    }
    accumulated += segLengths[i]
  }

  return { ...pts[pts.length - 1] }
}

/**
 * Find the nearest point on a polyline segment to a given world point.
 * Returns the nearest point and the parametric t value along the whole polyline.
 */
export function nearestPointOnPolyline(
  polyline: Point[],
  query: Point
): { point: Point; t: number; distSq: number } {
  if (polyline.length === 0) return { point: query, t: 0, distSq: Infinity }
  if (polyline.length === 1) {
    const dx = query.x - polyline[0].x
    const dy = query.y - polyline[0].y
    return { point: { ...polyline[0] }, t: 0, distSq: dx * dx + dy * dy }
  }

  // Compute segment lengths for parametric t
  const segLengths: number[] = []
  let totalLength = 0
  for (let i = 0; i < polyline.length - 1; i++) {
    const dx = polyline[i + 1].x - polyline[i].x
    const dy = polyline[i + 1].y - polyline[i].y
    const len = Math.sqrt(dx * dx + dy * dy)
    segLengths.push(len)
    totalLength += len
  }

  let bestDistSq = Infinity
  let bestPoint: Point = { ...polyline[0] }
  let bestT = 0
  let accumulated = 0

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]
    const b = polyline[i + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const lenSq = abx * abx + aby * aby

    let u = 0
    if (lenSq > 0) {
      u = ((query.x - a.x) * abx + (query.y - a.y) * aby) / lenSq
      u = Math.max(0, Math.min(1, u))
    }

    const px = a.x + u * abx
    const py = a.y + u * aby
    const dx = query.x - px
    const dy = query.y - py
    const distSq = dx * dx + dy * dy

    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestPoint = { x: px, y: py }
      const segT = totalLength > 0 ? (accumulated + u * segLengths[i]) / totalLength : 0
      bestT = segT
    }
    accumulated += segLengths[i]
  }

  return { point: bestPoint, t: bestT, distSq: bestDistSq }
}
