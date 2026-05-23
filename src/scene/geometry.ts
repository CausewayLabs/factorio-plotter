/**
 * Geometry helpers for bubble port positions, rail hit geometry, etc.
 */
import type { Point } from './types'
import type { Rail } from './types'

export const BUBBLE_RADIUS = 36
export const BUBBLE_OUTPUT_PORT_OFFSET = BUBBLE_RADIUS // right edge
export const INPUT_PORT_RADIUS = 5

/**
 * The output port of a bubble is at its right edge center.
 */
export function bubbleOutputPort(center: Point): Point {
  return { x: center.x + BUBBLE_RADIUS, y: center.y }
}

/**
 * Input ports are arranged vertically on the left side of the bubble,
 * spaced evenly. Index 0 is topmost.
 */
export function bubbleInputPort(center: Point, index: number, total: number): Point {
  const spacing = total > 1 ? (BUBBLE_RADIUS * 1.6) / (total - 1) : 0
  const startY = center.y - (BUBBLE_RADIUS * 0.8) + spacing * 0
  return {
    x: center.x - BUBBLE_RADIUS,
    y: total === 1 ? center.y : startY + spacing * index,
  }
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
