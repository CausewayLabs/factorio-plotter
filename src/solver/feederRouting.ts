/**
 * Feeder lane routing.
 *
 * Feeders are rewritten from direct lines into ORTHOGONAL trunks that reserve
 * space on a global grid, so parallel feeders never stack on top of one another
 * — even when they come from *different* rails. This is feeder-feeder legibility
 * spacing, NOT obstacle avoidance: feeders still cross bubbles and rails freely
 * (see the "no obstacle avoidance" invariant in the Codebase Guide).
 *
 * Model
 * -----
 * Authored rails are orthogonal (every segment is H or V), so each feeder gets
 * a *trunk* run perpendicular to the rail it taps, sitting in a reserved lane:
 *
 *   - Horizontal rail → vertical trunk in a reserved **X** lane:
 *       [ (L, railY), (L, portY), (portX, portY) ]
 *   - Vertical rail   → horizontal trunk in a reserved **Y** lane:
 *       [ (railX, L), (portX, L), (portX, portY) ]
 *   - Bubble source (no rail) → vertical trunk near the port's X:
 *       [ S, (L, S.y), (L, portY), (portX, portY) ]
 *
 * The rail attach point is free to slide along the tapped segment, so for rail
 * feeders the trunk lane IS the attach X/Y (no extra jog at the rail end).
 *
 * Lanes are multiples of LANE_GRID. Two trunks conflict only when they share a
 * lane AND their perpendicular spans overlap; the allocator searches outward
 * from the ideal lane (the port's coordinate, for the shortest jog) to the
 * first free lane. Allocation runs in a deterministic feeder order so the same
 * scene always yields the same lanes — feeders don't pop between lanes on every
 * re-solve (the lanes only shift when the set of feeders/spans actually changes).
 */
import type { Feeder, Point } from '../scene/types'

/** World-space spacing between adjacent feeder trunk lanes. */
const LANE_GRID = 14
/** How many lanes outward to search before giving up and overlapping. */
const MAX_LANE_TRIES = 48
/**
 * Mandatory lead: every feeder leaves a port with at least this much of a
 * straight stub (in the port's outward facing direction) before its trunk, so
 * no trunk sits flush against a tab. Applies to input ports and bubble emit ports.
 */
const PORT_STUB = 10

/** [lo, hi] span along a lane's perpendicular axis. */
type Interval = [number, number]

function intervalsOverlap(a: Interval, b: Interval): boolean {
  return !(a[1] < b[0] || a[0] > b[1])
}

/**
 * Reserve a lane on `map` (keyed by snapped lane coordinate) for `span`.
 * Searches outward from `ideal` (snapped to the grid), staying within [lo, hi],
 * for the first lane whose existing spans don't overlap. Records and returns the
 * chosen lane; falls back to the snapped ideal (accepting overlap) if the whole
 * search range is occupied.
 */
function reserveLane(
  map: Map<number, Interval[]>,
  ideal: number,
  span: Interval,
  lo: number,
  hi: number
): number {
  const snap = (v: number) => Math.round(v / LANE_GRID) * LANE_GRID
  // Clamp the starting lane into [lo, hi] (unbounded for bubble sources).
  const loSnap = lo === -Infinity ? -Infinity : snap(lo)
  const hiSnap = hi === Infinity ? Infinity : snap(hi)
  const base = Math.min(Math.max(snap(ideal), loSnap), hiSnap)
  const inRange = (v: number) => v >= lo - 0.5 && v <= hi + 0.5
  const free = (lane: number) => {
    const occ = map.get(lane)
    return !occ || !occ.some(iv => intervalsOverlap(iv, span))
  }

  let chosen = base
  for (let k = 0; k <= MAX_LANE_TRIES; k++) {
    const up = base + k * LANE_GRID
    if (inRange(up) && free(up)) { chosen = up; break }
    if (k > 0) {
      const dn = base - k * LANE_GRID
      if (inRange(dn) && free(dn)) { chosen = dn; break }
    }
  }
  const list = map.get(chosen)
  if (list) list.push(span)
  else map.set(chosen, [span])
  return chosen
}

/** Endpoints of the polyline segment nearest to `q`. */
function nearestSegment(poly: Point[], q: Point): { a: Point; b: Point } | null {
  if (poly.length < 2) return null
  let bestIdx = 0
  let bestD = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]
    const b = poly[i + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const l2 = abx * abx + aby * aby
    let u = l2 > 0 ? ((q.x - a.x) * abx + (q.y - a.y) * aby) / l2 : 0
    u = Math.max(0, Math.min(1, u))
    const px = a.x + u * abx
    const py = a.y + u * aby
    const d = (q.x - px) ** 2 + (q.y - py) ** 2
    if (d < bestD) { bestD = d; bestIdx = i }
  }
  return { a: poly[bestIdx], b: poly[bestIdx + 1] }
}

/** Drop consecutive (near-)duplicate points so collapsed jogs become straight. */
function dedupe(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p)
  }
  return out.length >= 2 ? out : pts
}

/**
 * Rewrite every feeder's `pathPoints` (and, for rail feeders, its source
 * `attachPoint`) into an orthogonal trunk routed through a globally-reserved
 * grid lane. Mutates the feeders in place.
 */
export function routeFeeders(
  feeders: Feeder[],
  resolvedRailPoints: Map<string, Point[]>,
  bubbleCenters: Map<string, Point>
): void {
  const vLanes = new Map<number, Interval[]>() // X lane → occupied Y-spans (vertical trunks)

  // Deterministic order ⇒ stable lane assignment across re-solves.
  const ordered = [...feeders].sort(
    (a, b) =>
      a.resourceType.localeCompare(b.resourceType) ||
      a.bubbleId.localeCompare(b.bubbleId) ||
      a.inputPort.y - b.inputPort.y ||
      a.inputPort.x - b.inputPort.x
  )

  for (const f of ordered) {
    const port = f.inputPort
    // Input port outward (facing) direction, from the target bubble center:
    // left tab faces left (-1), right tab faces right (+1).
    const tgtC = bubbleCenters.get(f.bubbleId)
    const tgtOut = tgtC ? (port.x >= tgtC.x ? 1 : -1) : 1

    if (f.source.kind === 'rail') {
      const poly = resolvedRailPoints.get(f.source.railId)
      const seg = poly ? nearestSegment(poly, port) : null
      if (!seg) continue
      const isHorizontal = Math.abs(seg.a.y - seg.b.y) <= Math.abs(seg.a.x - seg.b.x)

      if (isHorizontal) {
        // Vertical trunk. Keep it >= PORT_STUB beyond the port on its outward
        // side, so the jog into the tab is a visible lead, never flush/inward.
        const railY = seg.a.y
        const segLo = Math.min(seg.a.x, seg.b.x)
        const segHi = Math.max(seg.a.x, seg.b.x)
        const lo = tgtOut > 0 ? Math.min(Math.max(segLo, port.x + PORT_STUB), segHi) : segLo
        const hi = tgtOut > 0 ? segHi : Math.max(Math.min(segHi, port.x - PORT_STUB), segLo)
        const ideal = tgtOut > 0 ? lo : hi
        const span: Interval = [Math.min(railY, port.y), Math.max(railY, port.y)]
        const lane = reserveLane(vLanes, ideal, span, lo, hi)
        const attach = { x: lane, y: railY }
        f.source = { ...f.source, attachPoint: attach }
        f.pathPoints = dedupe([attach, { x: lane, y: port.y }, { x: port.x, y: port.y }])
      } else {
        // Vertical rail: the port faces sideways, so the feeder runs as a single
        // straight horizontal line at the port's EXACT Y into the port — no
        // perpendicular trunk and no grid snap. (Snapping the trunk's Y here was
        // the zigzag: the lane grid didn't line up with the port's own Y.) The
        // attach Y clamps to the rail's extent in the rare out-of-range case.
        const railX = seg.a.x
        const segLo = Math.min(seg.a.y, seg.b.y)
        const segHi = Math.max(seg.a.y, seg.b.y)
        const attachY = Math.max(segLo, Math.min(segHi, port.y))
        const attach = { x: railX, y: attachY }
        f.source = { ...f.source, attachPoint: attach }
        f.pathPoints = dedupe([attach, { x: port.x, y: attachY }, { x: port.x, y: port.y }])
      }
    } else {
      // Bubble source: a fixed emit port that faces outward from its bubble.
      // The vertical trunk must clear BOTH ports by >= PORT_STUB on their
      // outward sides — a lead out of the emit (no backtrack over the output
      // tab) and a lead into the input port. (`srcOut`/`tgtOut` > 0 → faces right.)
      const s = f.source.attachPoint
      const srcC = bubbleCenters.get(f.source.bubbleId)
      const srcOut = srcC ? (s.x >= srcC.x ? 1 : -1) : 1
      const span: Interval = [Math.min(s.y, port.y), Math.max(s.y, port.y)]
      let lo = -Infinity
      let hi = Infinity
      if (srcOut > 0) lo = Math.max(lo, s.x + PORT_STUB)
      else hi = Math.min(hi, s.x - PORT_STUB)
      if (tgtOut > 0) lo = Math.max(lo, port.x + PORT_STUB)
      else hi = Math.min(hi, port.x - PORT_STUB)
      if (lo > hi) {
        // Opposing facings can't satisfy both with one vertical trunk — keep the
        // input-port lead (the prominent one) and let the source side ride.
        if (tgtOut > 0) { lo = port.x + PORT_STUB; hi = Infinity }
        else { hi = port.x - PORT_STUB; lo = -Infinity }
      }
      const ideal = Number.isFinite(lo) ? lo : Number.isFinite(hi) ? hi : port.x
      const lane = reserveLane(vLanes, ideal, span, lo, hi)
      f.pathPoints = dedupe([s, { x: lane, y: s.y }, { x: lane, y: port.y }, { x: port.x, y: port.y }])
    }
  }
}
