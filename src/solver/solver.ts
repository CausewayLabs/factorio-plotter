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

import type { Bubble, Feeder, FeederSource, InputSide, InputSlot, OutputConnector, Point, Rail } from '../scene/types'
import type { Recipe } from '../recipes/types'
import { assignSideIndices, bubbleInputBox, bubbleOutputPort, nearestPointOnPolyline, orthogonalConnector } from '../scene/geometry'
import { resolveRailPolyline } from '../scene/geometry'
import { canonicalProductKey } from '../recipes/normalize'

// ============================================================
// Public interface
// ============================================================

export interface SolverInput {
  bubbles: Record<string, Bubble>
  rails: Record<string, Rail>
  resolveRecipe: (id: string) => Recipe | null
}

export interface SolverOutput {
  feeders: Feeder[]
  /** Derived output connectors (bubble output → bound bus). Mirror of feeders. */
  outputConnectors: OutputConnector[]
  /** Set of bubbleId+resourceType pairs that have no matching source */
  missingInputs: Set<string>
  /** Per-bubble input tab layout (side assignment derived from feeder direction). */
  inputLayouts: Record<string, InputSlot[]>
}

let _nextFeederId = 0
function nextFeederId(): string {
  return `feeder-${++_nextFeederId}`
}

let _nextConnectorId = 0
function nextConnectorId(): string {
  return `outconn-${++_nextConnectorId}`
}

// ============================================================
// Main solver function
// ============================================================

export function solveScene(input: SolverInput): SolverOutput {
  const { bubbles, rails, resolveRecipe } = input
  const feeders: Feeder[] = []
  const outputConnectors: OutputConnector[] = []
  const missingInputs = new Set<string>()
  const inputLayouts: Record<string, InputSlot[]> = {}

  const bubbleArray = Object.values(bubbles)
  const railArray = Object.values(rails)

  // Resolve actual first point of each rail (accounting for fork origin)
  const resolvedRailPoints = new Map<string, Point[]>()
  for (const rail of railArray) {
    resolvedRailPoints.set(rail.id, resolveRailPolyline(rail, rails))
  }

  // Supply rails available as sources
  const supplyRails = railArray.filter(r => r.isSupply)

  for (const bubble of bubbleArray) {
    const recipe = resolveRecipe(bubble.recipeId)
    const inputs = recipe?.inputs ?? []

    // Pass 1: find the nearest source for each input using the bubble CENTER as
    // the query point (side-agnostic). The source's horizontal position relative
    // to the center then picks which side the tab snaps to — left when the feeder
    // arrives from the left, right when from the right. Unmet inputs default left.
    const resolved = inputs.map(resourceType => {
      const source = findNearestSource(
        resourceType,
        bubble.position,
        supplyRails,
        resolvedRailPoints,
        bubbleArray,
        bubble.id
      )
      const side: InputSide =
        source && source.attachPoint.x >= bubble.position.x ? 'right' : 'left'
      return { resourceType, source, side, satisfied: source !== null }
    })

    // Pass 2: assign per-side indices, then place each tab and its feeder.
    const slots = assignSideIndices(resolved)
    inputLayouts[bubble.id] = slots.map(s => ({
      resourceType: s.resourceType,
      side: s.side,
      sideIndex: s.sideIndex,
      sideTotal: s.sideTotal,
      satisfied: s.satisfied,
    }))

    for (const slot of slots) {
      if (!slot.source) {
        missingInputs.add(`${bubble.id}:${slot.resourceType}`)
        continue
      }

      const inputPort = bubbleInputBox(
        bubble.position,
        slot.side,
        slot.sideIndex,
        slot.sideTotal
      ).port

      // Re-resolve the rail attach point against the actual port (rails attach
      // at the nearest point on the polyline; bubble sources attach at center).
      let attachPoint = slot.source.attachPoint
      if (slot.source.feederSource.kind === 'rail') {
        const pts = resolvedRailPoints.get(slot.source.feederSource.railId)
        if (pts && pts.length >= 2) {
          attachPoint = nearestPointOnPolyline(pts, inputPort).point
        }
      }

      // Direct straight-line feeder from source to the bubble's input tab.
      const feederSource: FeederSource =
        slot.source.feederSource.kind === 'rail'
          ? { ...slot.source.feederSource, attachPoint }
          : slot.source.feederSource

      feeders.push({
        id: nextFeederId(),
        bubbleId: bubble.id,
        resourceType: slot.resourceType,
        source: feederSource,
        pathPoints: [attachPoint, inputPort],
        inputPort,
      })
    }
  }

  // Output connectors: one per non-null entry in outputBindings.
  // Each bound product emits a derived orthogonal line from the bubble's output
  // port to the nearest point on the bound rail.
  for (const bubble of bubbleArray) {
    const port = bubbleOutputPort(bubble.position)

    for (const [productId, railId] of Object.entries(bubble.outputBindings)) {
      if (!railId) continue
      const rail = rails[railId]
      if (!rail) continue
      const pts = resolvedRailPoints.get(rail.id) ?? rail.points
      if (pts.length < 1) continue

      const target =
        pts.length >= 2 ? nearestPointOnPolyline(pts, port).point : pts[0]

      outputConnectors.push({
        id: nextConnectorId(),
        bubbleId: bubble.id,
        railId: rail.id,
        resourceType: productId,
        pathPoints: orthogonalConnector(port, target),
      })
    }
  }

  return { feeders, outputConnectors, missingInputs, inputLayouts }
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

  // Feeders are direct lines now, so rank sources by straight-line (Euclidean)
  // distance — the visual length of the connection. Resource identity is matched
  // by canonical key (case- and hyphen-insensitive) so a rail carrying
  // "Copper Plate" still feeds a bubble needing "copper-plate".
  const wantKey = canonicalProductKey(resourceType)

  // Check supply rails (a rail is a bus: it may carry several resource types)
  for (const rail of supplyRails) {
    if (!rail.resourceTypes.some(t => canonicalProductKey(t) === wantKey)) continue
    const pts = resolvedRailPoints.get(rail.id) ?? rail.points
    if (pts.length < 2) continue

    const { point, distSq: dSq } = nearestPointOnPolyline(pts, queryPoint)

    if (best === null || dSq < best.distSq) {
      best = {
        feederSource: { kind: 'rail', railId: rail.id, attachPoint: point },
        attachPoint: point,
        distSq: dSq,
      }
    }
  }

  // Check non-private bubble outputs — a bubble is a valid source for a
  // resourceType if it appears in outputBindings with a null value (unbound
  // output still available as a direct bubble-to-bubble feeder source).
  for (const sourceBubble of allBubbles) {
    if (sourceBubble.id === queryBubbleId) continue
    if (sourceBubble.isPrivate) continue

    // Check if this bubble produces the wanted resource type as an unbound output
    const hasUnbound = Object.entries(sourceBubble.outputBindings).some(
      ([productId, railId]) =>
        canonicalProductKey(productId) === wantKey && railId === null
    )
    if (!hasUnbound) continue

    const center = sourceBubble.position
    const dSq = distSqPoints(queryPoint, center)

    if (best === null || dSq < best.distSq) {
      best = {
        feederSource: { kind: 'bubble', bubbleId: sourceBubble.id, attachPoint: center },
        attachPoint: center,
        distSq: dSq,
      }
    }
  }

  return best
}

function distSqPoints(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
