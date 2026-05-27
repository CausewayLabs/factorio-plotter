/**
 * Geometry helpers for bubble port positions, rail hit geometry, etc.
 */
import type { Point } from './types'
import type { Rail, InputSide } from './types'

export const BUBBLE_RADIUS = 40
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
 * Resolve a rail's world-space polyline.
 *
 * For a plain rail this is just `rail.points`. For a *tee* (`rail.tee`) the
 * resolver casts a ray from the child's free endpoint (`points[0]`) along the
 * vector `points[1] - points[0]` (the authored ray direction) and looks for
 * the first hit on the parent's resolved polyline:
 *
 *   - **Hit** → resolved polyline = `[freeEnd, hit]`. Standard tee junction.
 *   - **Miss** → child renders as an orthogonal L into the parent's
 *     `anchorEndIndex` endpoint: `[freeEnd, elbow, parentEndpoint]`. Because
 *     authored rails are H/V, the ray and the parent's tangent at that
 *     endpoint are perpendicular, so the elbow is always finite and 90°.
 *
 * This is a pure function of stored state — drag handlers are responsible for
 * keeping `tee.anchorEndIndex` in sync with the side the ray slid off (see
 * `recomputeTeeAnchors` in `scene/store.ts`).
 *
 * Shared by hit-testing, rendering, the solver, and endpoint editing so a
 * tee's geometry is computed one way everywhere.
 */
export function resolveRailPolyline(
  rail: Rail,
  rails: Record<string, Rail>
): Point[] {
  if (!rail.tee) return rail.points
  const parent = rails[rail.tee.parentRailId]
  if (!parent || rail.points.length < 2) return rail.points

  const freeEnd = rail.points[0]
  const ref = rail.points[1]
  const dx = ref.x - freeEnd.x
  const dy = ref.y - freeEnd.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return rail.points
  const dn: Point = { x: dx / len, y: dy / len }

  const parentPoly = resolveRailPolyline(parent, rails)
  const hit = rayHitPolyline(freeEnd, dn, parentPoly)
  if (hit) return [freeEnd, hit]

  // Miss: build an L-elbow into the chosen parent endpoint.
  const anchorIdx = rail.tee.anchorEndIndex === 0 ? 0 : parentPoly.length - 1
  const anchorPt = parentPoly[anchorIdx]
  // Since rays and parent segments are orthogonal, project axis-aligned:
  // a vertical ray meets the parent's tangent at (freeEnd.x, anchorPt.y) and
  // vice versa. Picking by the ray's dominant axis covers both cases.
  const elbow: Point =
    Math.abs(dn.x) < Math.abs(dn.y)
      ? { x: freeEnd.x, y: anchorPt.y }
      : { x: anchorPt.x, y: freeEnd.y }
  return [freeEnd, elbow, anchorPt]
}

/**
 * Resolve the world-space point at parameter t ∈ [0,1] along a polyline by
 * arc length. Used by the fork-rail tool to find the click point on a parent
 * rail from a stored t. (Not used for tee resolution itself — that's the
 * ray-cast above.)
 */
export function pointOnPolylineAtT(poly: Point[], t: number): Point {
  if (poly.length === 0) return { x: 0, y: 0 }
  if (poly.length === 1) return { ...poly[0] }
  const lens: number[] = []
  let total = 0
  for (let i = 0; i < poly.length - 1; i++) {
    const l = Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y)
    lens.push(l); total += l
  }
  if (total === 0) return { ...poly[0] }
  const target = Math.max(0, Math.min(1, t)) * total
  let acc = 0
  for (let i = 0; i < lens.length; i++) {
    if (acc + lens[i] >= target) {
      const u = (target - acc) / lens[i]
      return {
        x: poly[i].x + u * (poly[i + 1].x - poly[i].x),
        y: poly[i].y + u * (poly[i + 1].y - poly[i].y),
      }
    }
    acc += lens[i]
  }
  return { ...poly[poly.length - 1] }
}

/**
 * Cast a ray from `origin` in unit direction `dn` and return the first hit on
 * a polyline (any segment, axis-aligned or otherwise). Returns null if the ray
 * never hits. Tiny positive distances are ignored so a ray that grazes its own
 * origin doesn't self-hit.
 */
export function rayHitPolyline(origin: Point, dn: Point, polyline: Point[]): Point | null {
  let bestT = Infinity
  let bestPt: Point | null = null
  const EPS = 1e-6
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]
    const b = polyline[i + 1]
    const sx = b.x - a.x
    const sy = b.y - a.y
    const det = dn.x * -sy - dn.y * -sx
    if (Math.abs(det) < EPS) continue // parallel
    const t = ((a.x - origin.x) * -sy - (a.y - origin.y) * -sx) / det
    const u = (dn.x * (a.y - origin.y) - dn.y * (a.x - origin.x)) / det
    if (t < EPS) continue
    if (u < -EPS || u > 1 + EPS) continue
    if (t < bestT) {
      bestT = t
      bestPt = { x: origin.x + t * dn.x, y: origin.y + t * dn.y }
    }
  }
  return bestPt
}

/**
 * For a tee child whose ray currently hits the parent, decide which of the
 * parent's two endpoints (0 or 1) it should anchor to: whichever the hit is
 * closer to along the parent's polyline. Used by drag handlers to keep
 * `tee.anchorEndIndex` in sync so the elbow snaps to the correct side when
 * the parent later slides past the ray.
 */
export function teeAnchorSideForHit(parentPoly: Point[], hit: Point): 0 | 1 {
  // Walk segments, accumulate length to nearest hit, compare to half-length.
  let total = 0
  const segLens: number[] = []
  for (let i = 0; i < parentPoly.length - 1; i++) {
    const l = Math.hypot(parentPoly[i + 1].x - parentPoly[i].x, parentPoly[i + 1].y - parentPoly[i].y)
    segLens.push(l)
    total += l
  }
  if (total === 0) return 0
  // Find which segment the hit lies on, then distance from start of polyline.
  let distFromStart = 0
  let bestSeg = 0
  let bestSegDist = Infinity
  for (let i = 0; i < parentPoly.length - 1; i++) {
    const a = parentPoly[i]
    const b = parentPoly[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    if (l2 === 0) continue
    const u = Math.max(0, Math.min(1, ((hit.x - a.x) * dx + (hit.y - a.y) * dy) / l2))
    const projX = a.x + u * dx, projY = a.y + u * dy
    const d = Math.hypot(hit.x - projX, hit.y - projY)
    if (d < bestSegDist) {
      bestSegDist = d
      bestSeg = i
      let acc = 0
      for (let j = 0; j < i; j++) acc += segLens[j]
      distFromStart = acc + u * Math.hypot(dx, dy)
    }
  }
  void bestSeg
  return distFromStart >= total / 2 ? 1 : 0
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
