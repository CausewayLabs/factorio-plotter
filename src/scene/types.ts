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

/** Parametric origin for a forked rail: position on parent rail at parameter t ∈ [0,1] */
export interface ParametricOrigin {
  parentRailId: string
  /** Parameter along the parent rail's polyline, 0 = start, 1 = end */
  t: number
}

// ============================================================
// AUTHORED entities (persistent, user-placed, attachable)
// ============================================================

/**
 * A bubble represents a factory concept (intermediate product).
 * It is authored by the user — placed, moved, deleted explicitly.
 */
export interface Bubble {
  id: string
  /** World-space center position */
  position: Point
  /** The product this bubble produces */
  productId: string
  /**
   * Which recipe variant the bubble uses (matches RecipeVariant.variantId).
   * If null, the default recipe for the product is used.
   */
  recipeVariantId: string | null
  /**
   * When true, this bubble's output is NOT available as a feeder source.
   * It can still receive feeders for its own inputs.
   */
  isPrivate: boolean
}

/**
 * A rail is a typed resource supply line — a polyline on the canvas.
 * Rails are authored by the user: drawn, extended, bent, forked.
 */
export interface Rail {
  id: string
  /** The resource type this rail carries (matches a product name) */
  resourceType: string
  /** World-space vertices of the polyline, in order */
  points: Point[]
  /**
   * When true, this rail is a supply source — feeders may attach to it.
   * When false, the rail is decorative/routing only.
   */
  isSupply: boolean
  /**
   * If this rail was forked from another, this records the parametric origin.
   * The fork point slides along the parent rail when the parent is reshaped.
   * Null for root rails drawn from scratch.
   */
  parametricOrigin: ParametricOrigin | null
}

// ============================================================
// DERIVED entities (recomputed by solver, never persisted)
// ============================================================

/**
 * Describes which source satisfies a feeder connection.
 * Either a rail (nearest point on polyline) or another bubble's output port.
 */
export type FeederSource =
  | { kind: 'rail'; railId: string; attachPoint: Point }
  | { kind: 'bubble'; bubbleId: string; outputPort: Point }

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
   * Orthogonal path from source attach-point to bubble input port.
   * L-shaped or Z-shaped (2–3 segments). Collapses to a single segment
   * when source is directly aligned.
   */
  pathPoints: Point[]
  /** World-space point on the bubble where this feeder terminates */
  inputPort: Point
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
