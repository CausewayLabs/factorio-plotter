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

import type { Bubble, Feeder, FeederSource, InputSide, InputSlot, OutputConnector, OutputSlot, Point, Rail } from '../scene/types'
import type { Recipe } from '../recipes/types'
import { bubbleInputBox, nearestPointOnPolyline, orthogonalConnector, outputTabTip } from '../scene/geometry'
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
  /** Per-bubble output tab layout (side assignment derived from bound-rail direction). */
  outputLayouts: Record<string, OutputSlot[]>
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
  const bubbleArray = Object.values(bubbles)
  const railArray = Object.values(rails)

  // Resolve actual first point of each rail (accounting for fork origin)
  const resolvedRailPoints = new Map<string, Point[]>()
  for (const rail of railArray) {
    resolvedRailPoints.set(rail.id, resolveRailPolyline(rail, rails))
  }

  // Supply rails available as sources
  const supplyRails = railArray.filter(r => r.isSupply)

  // ---- Pre-pass: every bubble's APPROXIMATE output emit port per product ----
  // Lone-tab (sideIndex=0, sideTotal=1) approximation. Used for the first
  // solver pass below. A second pass rebuilds this map from the actual layout
  // so the input-side distance comparison sees the truly-rendered chevron tip,
  // which is what users visually expect when dragging bubbles around.
  const buildSourceEmitPort = (overrideLayouts?: Record<string, OutputSlot[]>): Map<string, Map<string, Point>> => {
    const out = new Map<string, Map<string, Point>>()
    for (const sourceBubble of bubbleArray) {
      const sRecipe = resolveRecipe(sourceBubble.recipeId)
      const sProducts = sRecipe?.products ?? []
      const info = new Map<string, Point>()
      const actualSlots = overrideLayouts?.[sourceBubble.id]
      for (const productId of sProducts) {
        const key = canonicalProductKey(productId)
        const actual = actualSlots?.find(s => canonicalProductKey(s.productId) === key)
        let side: InputSide = 'right'
        let sideIndex = 0
        let sideTotal = 1
        if (actual) {
          side = actual.side
          sideIndex = actual.sideIndex
          sideTotal = actual.sideTotal
        } else {
          const railId = sourceBubble.outputBindings[productId] ?? null
          if (railId) {
            const rail = rails[railId]
            const pts = rail ? resolvedRailPoints.get(rail.id) ?? rail.points : null
            if (pts && pts.length >= 2) {
              const np = nearestPointOnPolyline(pts, sourceBubble.position).point
              side = np.x >= sourceBubble.position.x ? 'right' : 'left'
            } else if (pts && pts.length === 1) {
              side = pts[0].x >= sourceBubble.position.x ? 'right' : 'left'
            }
          }
        }
        const box = bubbleInputBox(sourceBubble.position, side, sideIndex, sideTotal)
        info.set(key, outputTabTip(box))
      }
      out.set(sourceBubble.id, info)
    }
    return out
  }

  // Single solver pass. Decides input sides via ghost-port comparison against
  // `sourceEmitPort`, lays out slots, emits feeders + output connectors.
  const runPass = (
    sourceEmitPort: Map<string, Map<string, Point>>
  ): SolverOutput => {
    const feeders: Feeder[] = []
    const outputConnectors: OutputConnector[] = []
    const missingInputs = new Set<string>()
    const inputLayouts: Record<string, InputSlot[]> = {}
    const outputLayouts: Record<string, OutputSlot[]> = {}

    for (const bubble of bubbleArray) {
    const recipe = resolveRecipe(bubble.recipeId)
    const inputs = recipe?.inputs ?? []
    const outputProducts = recipe?.products ?? []

    // ---- Inputs: pick side by ghost-port distance ----
    // For each input we compute would-be ports on BOTH sides (lone-tab
    // approximation) and ask findNearestSource for the best source from each
    // perspective. Whichever side yields the shorter source distance wins.
    // This avoids the abrupt flip at center-crossing because bubble sources'
    // emit ports sit ~140px outside their center — symmetry breaks naturally.
    const inputResolved = inputs.map(resourceType => {
      const leftPort = bubbleInputBox(bubble.position, 'left', 0, 1).port
      const rightPort = bubbleInputBox(bubble.position, 'right', 0, 1).port
      const leftSrc = findNearestSource(
        resourceType, leftPort, supplyRails, rails, resolvedRailPoints,
        bubbleArray, bubble.id, sourceEmitPort
      )
      const rightSrc = findNearestSource(
        resourceType, rightPort, supplyRails, rails, resolvedRailPoints,
        bubbleArray, bubble.id, sourceEmitPort
      )
      let side: InputSide
      let source: ResolvedSource | null
      if (leftSrc && rightSrc) {
        if (leftSrc.distSq <= rightSrc.distSq) { side = 'left'; source = leftSrc }
        else { side = 'right'; source = rightSrc }
      } else if (leftSrc) { side = 'left'; source = leftSrc }
      else if (rightSrc) { side = 'right'; source = rightSrc }
      else { side = 'right'; source = null }
      return { kind: 'input' as const, resourceType, source, side, satisfied: source !== null }
    })

    // ---- Outputs: pick side based on bound-rail direction (default right) ----
    const outputResolved = outputProducts.map(productId => {
      const railId = bubble.outputBindings[productId] ?? null
      let side: InputSide = 'right'
      let attach: Point | null = null
      if (railId) {
        const rail = rails[railId]
        const pts = rail ? resolvedRailPoints.get(rail.id) ?? rail.points : null
        if (pts && pts.length >= 2) {
          // Use bubble center as the side-decider query (refined below to tab port).
          const np = nearestPointOnPolyline(pts, bubble.position).point
          side = np.x >= bubble.position.x ? 'right' : 'left'
          attach = np
        } else if (pts && pts.length === 1) {
          side = pts[0].x >= bubble.position.x ? 'right' : 'left'
          attach = pts[0]
        }
      }
      return { kind: 'output' as const, productId, side, railId, attach, isBound: railId !== null }
    })

    // ---- Unified per-side slot allocation ----
    // Inputs come first on their side, outputs second — keeps inputs visually
    // upper-left/upper-right and outputs lower in the stack (or at least after).
    type Side = InputSide
    const ordered = [...inputResolved, ...outputResolved]
    const leftTotal = ordered.reduce((n, p) => (p.side === 'left' ? n + 1 : n), 0)
    const rightTotal = ordered.length - leftTotal
    let leftIdx = 0
    let rightIdx = 0
    const sideTotalFor = (s: Side) => (s === 'left' ? leftTotal : rightTotal)
    const nextSideIdx = (s: Side) => (s === 'left' ? leftIdx++ : rightIdx++)

    const inputSlots: InputSlot[] = []
    const outputSlots: OutputSlot[] = []

    for (const p of ordered) {
      const sideIndex = nextSideIdx(p.side)
      const sideTotal = sideTotalFor(p.side)
      if (p.kind === 'input') {
        inputSlots.push({
          resourceType: p.resourceType,
          side: p.side,
          sideIndex,
          sideTotal,
          satisfied: p.satisfied,
        })
        // Emit the feeder (or mark missing) inline using the just-assigned slot.
        if (!p.source) {
          missingInputs.add(`${bubble.id}:${p.resourceType}`)
        } else {
          const inputPort = bubbleInputBox(bubble.position, p.side, sideIndex, sideTotal).port
          let attachPoint = p.source.attachPoint
          if (p.source.feederSource.kind === 'rail') {
            const pts = resolvedRailPoints.get(p.source.feederSource.railId)
            if (pts && pts.length >= 2) {
              attachPoint = nearestPointOnPolyline(pts, inputPort).point
            }
          }
          const feederSource: FeederSource =
            p.source.feederSource.kind === 'rail'
              ? { ...p.source.feederSource, attachPoint }
              : p.source.feederSource
          feeders.push({
            id: nextFeederId(),
            bubbleId: bubble.id,
            resourceType: p.resourceType,
            source: feederSource,
            pathPoints: [attachPoint, inputPort],
            inputPort,
          })
        }
      } else {
        outputSlots.push({
          productId: p.productId,
          side: p.side,
          sideIndex,
          sideTotal,
          isBound: p.isBound,
        })
        // Emit the output connector (if bound) using this output's chevron tip.
        if (p.railId && p.attach !== null) {
          const box = bubbleInputBox(bubble.position, p.side, sideIndex, sideTotal)
          const outPort = outputTabTip(box)
          const rail = rails[p.railId]
          const pts = rail ? resolvedRailPoints.get(rail.id) ?? rail.points : null
          const target = pts && pts.length >= 2 ? nearestPointOnPolyline(pts, outPort).point : p.attach
          outputConnectors.push({
            id: nextConnectorId(),
            bubbleId: bubble.id,
            railId: p.railId,
            resourceType: p.productId,
            pathPoints: orthogonalConnector(outPort, target),
          })
        }
      }
    }

      inputLayouts[bubble.id] = inputSlots
      outputLayouts[bubble.id] = outputSlots
    }

    // Post-pass: feeders whose source is a bubble were initialized with the
    // source bubble's approximate emit port. Now that outputLayouts is fully
    // built for THIS pass, rewrite those feeders to terminate at the actual
    // rendered chevron tip.
    for (const feeder of feeders) {
      if (feeder.source.kind !== 'bubble') continue
      const source = bubbles[feeder.source.bubbleId]
      if (!source) continue
      const slots = outputLayouts[source.id]
      if (!slots) continue
      const wantKey = canonicalProductKey(feeder.resourceType)
      const slot = slots.find(s => canonicalProductKey(s.productId) === wantKey)
      if (!slot) continue
      const box = bubbleInputBox(source.position, slot.side, slot.sideIndex, slot.sideTotal)
      const outPort = outputTabTip(box)
      feeder.source = { kind: 'bubble', bubbleId: source.id, attachPoint: outPort }
      feeder.pathPoints = [outPort, feeder.inputPort]
    }

    return { feeders, outputConnectors, missingInputs, inputLayouts, outputLayouts }
  }

  // Pass 1 with lone-tab approximation establishes a draft layout.
  const draft = runPass(buildSourceEmitPort())
  // Pass 2 uses the draft's actual output layouts to compute true emit ports —
  // this is what the user visually drags against, so the side-flip threshold
  // now matches the visible chevron tip rather than an under-estimated lone-tab
  // position.
  return runPass(buildSourceEmitPort(draft.outputLayouts))
}

// ============================================================
// Source resolution
// ============================================================

interface ResolvedSource {
  feederSource: FeederSource
  attachPoint: Point
  distSq: number
}

/**
 * Resource membership on a tee walks up the parent chain: a tee is a branch
 * of its parent's bus and physically carries everything the parent carries.
 * `seen` guards against pathological cycles (shouldn't happen but cheap).
 */
function railCarriesResource(
  rail: Rail,
  wantKey: string,
  rails: Record<string, Rail>,
  seen: Set<string> = new Set()
): boolean {
  if (seen.has(rail.id)) return false
  seen.add(rail.id)
  if (rail.resourceTypes.some(t => canonicalProductKey(t) === wantKey)) return true
  if (rail.tee) {
    const parent = rails[rail.tee.parentRailId]
    if (parent) return railCarriesResource(parent, wantKey, rails, seen)
  }
  return false
}

function findNearestSource(
  resourceType: string,
  queryPoint: Point,
  supplyRails: Rail[],
  rails: Record<string, Rail>,
  resolvedRailPoints: Map<string, Point[]>,
  allBubbles: Bubble[],
  queryBubbleId: string,
  sourceEmitPort: Map<string, Map<string, Point>>
): ResolvedSource | null {
  let best: ResolvedSource | null = null

  // Feeders are direct lines now, so rank sources by straight-line (Euclidean)
  // distance — the visual length of the connection. Resource identity is matched
  // by canonical key (case- and hyphen-insensitive) so a rail carrying
  // "Copper Plate" still feeds a bubble needing "copper-plate".
  const wantKey = canonicalProductKey(resourceType)

  // Check supply rails (a rail is a bus: it may carry several resource types).
  // A tee is a branch of its parent's bus and physically carries everything
  // the parent carries — so resource membership walks up the tee chain.
  for (const rail of supplyRails) {
    if (!railCarriesResource(rail, wantKey, rails)) continue
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
  // Distance is measured from queryPoint to the source's approximate output
  // emit port (chevron tip on its emit side), not its center — so the
  // input-side ghost-port comparison breaks symmetry as intended.
  for (const sourceBubble of allBubbles) {
    if (sourceBubble.id === queryBubbleId) continue
    if (sourceBubble.isPrivate) continue

    const hasUnbound = Object.entries(sourceBubble.outputBindings).some(
      ([productId, railId]) =>
        canonicalProductKey(productId) === wantKey && railId === null
    )
    if (!hasUnbound) continue

    const emit = sourceEmitPort.get(sourceBubble.id)?.get(wantKey) ?? sourceBubble.position
    const dSq = distSqPoints(queryPoint, emit)

    if (best === null || dSq < best.distSq) {
      best = {
        feederSource: { kind: 'bubble', bubbleId: sourceBubble.id, attachPoint: emit },
        attachPoint: emit,
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
