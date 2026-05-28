// ============================================================
// Core entity types for Factorio Plotter
// Authored entities: Bubble, Rail
// Derived entities: Feeder
// ============================================================

/** A point in world (canvas) coordinates */
export interface Point {
  x: number
  y: number
}

/**
 * Tee anchor for a forked rail.
 *
 * A tee is resolved at render time by casting a ray from the child's free
 * endpoint (its sole stored point) along the child's authored direction (the
 * vector from `points[0]` toward where the junction would be — stored as the
 * second-to-last segment direction; for the single-segment tees this is just
 * the ray direction).
 *
 * - If the ray hits the parent's resolved polyline, the junction is that hit.
 * - If it misses, the child renders as an L into parent endpoint
 *   #`anchorEndIndex` (0 = parent.points[0], 1 = parent.points[last]).
 *
 * The anchor is updated by drag handlers whenever the ray currently hits the
 * parent — it tracks "which side of the parent the ray slid off." The
 * resolver itself stays pure.
 */
export interface Tee {
  parentRailId: string
  anchorEndIndex: 0 | 1
}

// ============================================================
// AUTHORED entities (persistent, user-placed, attachable)
// ============================================================

/**
 * A bubble represents a factory production step.
 * It selects a recipe (not a product) and exposes every product in that recipe
 * as an independently-bindable output slot.
 * It is authored by the user — placed, moved, deleted explicitly.
 */
export interface Bubble {
  id: string
  /** World-space center position */
  position: Point
  /** The recipe this bubble uses (matches Recipe.id in the recipe map) */
  recipeId: string
  /**
   * When true, this bubble's outputs are NOT available as feeder sources.
   * It can still receive feeders for its own inputs.
   */
  isPrivate: boolean
  /**
   * Per-product output bindings. Keys are product ids from the recipe's products[].
   * A value of null means that output is unbound (not wired to any bus).
   * A non-null value is a rail id — the product is emitted onto that bus and
   * the solver draws a derived orthogonal output connector from the output port
   * to the rail. The rail is never anchored to the bubble.
   *
   * Initialized with one entry per product in the recipe, all null.
   */
  outputBindings: Record<string, string | null>
}

/**
 * A rail is a resource supply line (bus) — a polyline on the canvas.
 * Rails are authored by the user: drawn, extended, bent, forked.
 *
 * A rail is a *bus*: it carries one or more resource types. A plain rail is
 * simply a bus of one. A feeder may draw from a rail if the resource it needs
 * is among `resourceTypes` (e.g. a "scrap" bus carries the ~12 Fulgora
 * recycling outputs, and any bubble needing one of them can tap it).
 */
export interface Rail {
  id: string
  /** The resource types this bus carries (each matches a product name). At least one. */
  resourceTypes: string[]
  /** Optional display name for a multi-resource bus (e.g. "Scrap"). */
  label?: string
  /** World-space vertices of the polyline, in order */
  points: Point[]
  /**
   * When true, this rail is a supply source — feeders may attach to it.
   * When false, the rail is decorative/routing only.
   */
  isSupply: boolean
  /**
   * If this rail is a tee off another rail, this anchors it to its parent.
   * The junction is computed at resolve time by ray-casting from the child's
   * free endpoint (see `Tee` and `resolveRailPolyline`). The child renders
   * attached even when the parent slides past the ray — falling back to an
   * orthogonal L into the parent's `anchorEndIndex` endpoint.
   *
   * Undefined for root rails drawn from scratch. This is the ONLY anchoring
   * a rail has — rails are never anchored to bubbles.
   */
  tee?: Tee
}

/** Which side of a bubble an input tab is drawn on. Derived from feeder direction. */
export type InputSide = 'left' | 'right'

// ============================================================
// DERIVED entities (recomputed by solver, never persisted)
// ============================================================

/**
 * Per-input layout slot, derived by the solver.
 * The side a tab sits on follows the direction of its feeder's source relative
 * to the bubble center (source to the left → left side; to the right → right
 * side). `sideIndex`/`sideTotal` index the tab within its own side so each side
 * stacks/staggers independently. The renderer consumes this so tab geometry and
 * the solver's feeder endpoints stay in sync (bubble-port single-source-of-truth).
 */
export interface InputSlot {
  resourceType: string
  side: InputSide
  /** Index of this tab among ALL tabs (inputs + outputs) on the same side (0-based). */
  sideIndex: number
  /** Total number of tabs on this side (inputs + outputs combined). */
  sideTotal: number
  /** False when no matching source exists (missing-requirement). */
  satisfied: boolean
}

/**
 * Per-output layout slot, derived by the solver. Outputs share the side-slot
 * pool with inputs — a tab is a tab, direction is just a flag — so they never
 * collide on the same side. An output's side follows its bound rail's direction
 * (mirror of how input side follows feeder direction); unbound outputs default
 * to the right side.
 */
export interface OutputSlot {
  /** The product id this output emits. */
  productId: string
  side: InputSide
  /** Index of this tab among ALL tabs (inputs + outputs) on the same side. */
  sideIndex: number
  /** Total number of tabs on this side (inputs + outputs combined). */
  sideTotal: number
  /** True if this output is bound to a rail. */
  isBound: boolean
}

/**
 * Describes which source satisfies a feeder connection.
 * Either a rail (nearest point on polyline) or another bubble's output port.
 */
export type FeederSource =
  | { kind: 'rail'; railId: string; attachPoint: Point }
  | { kind: 'bubble'; bubbleId: string; attachPoint: Point }

/**
 * A feeder is an auto-derived orthogonal line connecting a bubble's input
 * to the nearest matching source (supply rail or non-private bubble output).
 * Feeders are NEVER authored, persisted, selected, or used as attachment targets.
 */
export interface Feeder {
  id: string
  /** The bubble this feeder feeds */
  bubbleId: string
  /** The resource type being fed */
  resourceType: string
  /** The source the feeder connects from */
  source: FeederSource
  /**
   * Orthogonal trunk path from source attach-point to bubble input port,
   * routed through a globally-reserved grid lane (`solver/feederRouting.ts`):
   * 2–4 points (L- or Z-shaped). Collapses toward a straight segment when the
   * reserved lane aligns with the port.
   */
  pathPoints: Point[]
  /** World-space point on the bubble where this feeder terminates */
  inputPort: Point
}

/**
 * An output connector is the mirror of a feeder: a derived ORTHOGONAL line
 * carrying one of a bubble's product outputs from its output port to the bus
 * it is bound to (via `Bubble.outputBindings`). A bubble with N non-null
 * bindings generates N output connectors. Like feeders, output connectors are
 * NEVER authored, persisted, selected, or used as attachment targets — they are
 * recomputed by the solver from current geometry.
 */
export interface OutputConnector {
  id: string
  /** The bubble whose output this carries */
  bubbleId: string
  /** The bus (rail) the output is emitted onto */
  railId: string
  /** The product being emitted (the bubble's productId) */
  resourceType: string
  /** Orthogonal path: output port → nearest point on the resolved rail polyline. */
  pathPoints: Point[]
}

// ============================================================
// Viewport transform
// ============================================================

/**
 * The screen↔world coordinate transform.
 * world = (screen - pan) / zoom
 * screen = world * zoom + pan
 */
export interface ViewportTransform {
  /** Current zoom factor (e.g. 1.0 = 100%) */
  zoom: number
  /** Pan offset in screen pixels */
  pan: Point
}

export function screenToWorld(screen: Point, vt: ViewportTransform): Point {
  return {
    x: (screen.x - vt.pan.x) / vt.zoom,
    y: (screen.y - vt.pan.y) / vt.zoom,
  }
}

export function worldToScreen(world: Point, vt: ViewportTransform): Point {
  return {
    x: world.x * vt.zoom + vt.pan.x,
    y: world.y * vt.zoom + vt.pan.y,
  }
}
