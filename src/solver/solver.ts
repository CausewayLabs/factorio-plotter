/**
 * Factorio Plotter Solver
 *
 * Pure function: given authored state (bubbles + rails) and recipe data,
 * derives all feeders and missing-requirement flags.
 *
 * Key invariants from the architecture:
 * - Operates entirely in world coordinates. No screen transform needed.
 * - No collision avoidance. Feeders may cross anything.
 * - Full recompute pass every time (no incremental/memoized).
 * - Feeders are derived output: never persisted, never selectable.
 */

import type { Bubble, Feeder, FeederSource, Point, Rail } from '../scene/types'
import type { RecipeVariant } from '../recipes/types'
import { bubbleInputPort, bubbleOutputPort, nearestPointOnPolyline } from '../scene/geometry'
import { resolveParametricPoint } from '../scene/geometry'

// ============================================================
// Public interface
// ============================================================

export interface SolverInput {
  bubbles: Record<string, Bubble>
  rails: Record<string, Rail>
  resolveRecipe: (product: string, variantId: string | null) => RecipeVariant | null
}

export interface SolverOutput {
  feeders: Feeder[]
  /** Set of bubbleId+resourceType pairs that have no matching source */
  missingInputs: Set<string>
}

let _nextFeederId = 0
function nextFeederId(): string {
  return `feeder-${++_nextFeederId}`
}

// ============================================================
// Main solver function
// ============================================================

export function solveScene(input: SolverInput): SolverOutput {
  const { bubbles, rails, resolveRecipe } = input
  const feeders: Feeder[] = []
  const missingInputs = new Set<string>()

  const bubbleArray = Object.values(bubbles)
  const railArray = Object.values(rails)

  // Resolve actual first point of each rail (accounting for parametric fork origin)
  const resolvedRailPoints = new Map<string, Point[]>()
  for (const rail of railArray) {
    resolvedRailPoints.set(rail.id, resolveRailPoints(rail, rails))
  }

  // Supply rails available as sources
  const supplyRails = railArray.filter(r => r.isSupply)

  for (const bubble of bubbleArray) {
    const recipe = resolveRecipe(bubble.productId, bubble.recipeVariantId)
    const inputs = recipe?.inputs ?? []

    for (let idx = 0; idx < inputs.length; idx++) {
      const resourceType = inputs[idx]
      const inputPort = bubbleInputPort(bubble.position, idx, inputs.length)

      const source = findNearestSource(
        resourceType,
        inputPort,
        supplyRails,
        resolvedRailPoints,
        bubbleArray,
        bubble.id
      )

      if (!source) {
        missingInputs.add(`${bubble.id}:${resourceType}`)
        continue
      }

      const pathPoints = routeOrthogonal(inputPort, source.attachPoint)

      feeders.push({
        id: nextFeederId(),
        bubbleId: bubble.id,
        resourceType,
        source: source.feederSource,
        pathPoints,
        inputPort,
      })
    }
  }

  return { feeders, missingInputs }
}

// ============================================================
// Source resolution
// ============================================================

interface ResolvedSource {
  feederSource: FeederSource
  attachPoint: Point
  distSq: number
}

function findNearestSource(
  resourceType: string,
  queryPoint: Point,
  supplyRails: Rail[],
  resolvedRailPoints: Map<string, Point[]>,
  allBubbles: Bubble[],
  queryBubbleId: string
): ResolvedSource | null {
  let best: ResolvedSource | null = null

  // Check supply rails
  for (const rail of supplyRails) {
    if (rail.resourceType !== resourceType) continue
    const pts = resolvedRailPoints.get(rail.id) ?? rail.points
    if (pts.length < 2) continue

    const { point } = nearestPointOnPolyline(pts, queryPoint)
    // Use Manhattan/orthogonal distance heuristic: dx + dy
    const manhattan = manhattanDist(queryPoint, point)
    const score = manhattan * manhattan // compare by manhattan^2 for consistency

    if (best === null || score < best.distSq) {
      best = {
        feederSource: { kind: 'rail', railId: rail.id, attachPoint: point },
        attachPoint: point,
        distSq: score,
      }
    }
  }

  // Check non-private bubble outputs
  for (const sourceBubble of allBubbles) {
    if (sourceBubble.id === queryBubbleId) continue
    if (sourceBubble.isPrivate) continue
    if (sourceBubble.productId !== resourceType) continue

    const outputPort = bubbleOutputPort(sourceBubble.position)
    const manhattan = manhattanDist(queryPoint, outputPort)
    const score = manhattan * manhattan

    if (best === null || score < best.distSq) {
      best = {
        feederSource: { kind: 'bubble', bubbleId: sourceBubble.id, outputPort },
        attachPoint: outputPort,
        distSq: score,
      }
    }
  }

  return best
}

function manhattanDist(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

// ============================================================
// Orthogonal feeder routing (L/Z shape)
// ============================================================

/**
 * Route an orthogonal path from sourcePoint to targetPoint.
 * Uses an L-shape: horizontal then vertical.
 * Collapses to a single segment if already aligned on one axis.
 */
export function routeOrthogonal(target: Point, source: Point): Point[] {
  if (Math.abs(source.x - target.x) < 0.5) {
    // Already horizontally aligned — straight vertical segment
    return [source, target]
  }
  if (Math.abs(source.y - target.y) < 0.5) {
    // Already vertically aligned — straight horizontal segment
    return [source, target]
  }

  // L-shape: go horizontally to target x, then vertically to target y
  const corner: Point = { x: target.x, y: source.y }
  return [source, corner, target]
}

// ============================================================
// Resolve actual polyline points for a rail (handles fork origins)
// ============================================================

function resolveRailPoints(rail: Rail, allRails: Record<string, Rail>): Point[] {
  if (!rail.parametricOrigin) {
    return rail.points
  }

  const parent = allRails[rail.parametricOrigin.parentRailId]
  if (!parent) return rail.points

  const forkPoint = resolveParametricPoint(parent, rail.parametricOrigin.t)
  // Replace first stored point with the resolved fork point
  return [forkPoint, ...rail.points.slice(1)]
}
