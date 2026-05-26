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
   * If this rail was forked from another, this records the parametric origin.
   * The fork point slides along the parent rail when the parent is reshaped.
   * Null for root rails drawn from scratch.
   *
   * This is the ONLY anchoring a rail has — rails are never anchored to bubbles.
   * A bubble's output reaches a bus via a derived output connector, not by
   * gluing a rail endpoint to the bubble.
   */
  parametricOrigin: ParametricOrigin | null
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
  /** Index of this tab among tabs on the same side (0-based). */
  sideIndex: number
  /** Total number of tabs on this side. */
  sideTotal: number
  /** False when no matching source exists (missing-requirement). */
  satisfied: boolean
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
   * Orthogonal path from source attach-point to bubble input port.
   * L-shaped or Z-shaped (2–3 segments). Collapses to a single segment
   * when source is directly aligned.
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
