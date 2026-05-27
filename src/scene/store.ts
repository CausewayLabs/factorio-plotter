import { create } from 'zustand'
import type { Bubble, Feeder, InputSlot, OutputConnector, OutputSlot, Point, Rail, ViewportTransform } from './types'

// ============================================================
// Store shape
// ============================================================

export interface AuthoredState {
  /** Map of bubble id → Bubble */
  bubbles: Record<string, Bubble>
  /** Map of rail id → Rail */
  rails: Record<string, Rail>
}

export interface DerivedState {
  /** Derived feeders — written by solver, read by renderer. Never persisted. */
  feeders: Feeder[]
  /** Derived output connectors (bubble output → bound bus). Never persisted. */
  outputConnectors: OutputConnector[]
  /**
   * Set of "bubbleId:resourceType" strings indicating missing inputs.
   * Written by solver, read by renderer for missing-requirement badge.
   */
  missingInputs: Set<string>
  /**
   * Per-bubble input tab layout (side assignment + per-side indices), written by
   * the solver and read by the renderer so tab geometry matches feeder endpoints.
   */
  inputLayouts: Record<string, InputSlot[]>
  /**
   * Per-bubble output tab layout (side assignment + per-side indices). Outputs
   * share the side-slot pool with inputs so they never collide on the same side.
   */
  outputLayouts: Record<string, OutputSlot[]>
}

export interface SceneStore extends AuthoredState, DerivedState {
  viewport: ViewportTransform

  // --- Bubble mutations ---
  addBubble: (bubble: Bubble) => void
  moveBubble: (id: string, position: Point) => void
  deleteBubble: (id: string) => void
  setBubbleRecipe: (id: string, recipeId: string, outputBindings: Record<string, string | null>) => void
  setBubblePrivate: (id: string, isPrivate: boolean) => void
  /**
   * Bind (or unbind, with null) a specific product output from a bubble to a rail.
   * When binding: adds productId to the rail's resourceTypes if not already present.
   * When unbinding: removes productId from the rail's resourceTypes if no other
   * bubble on that rail still binds the same product.
   */
  setOutputBinding: (bubbleId: string, productId: string, railId: string | null) => void

  // --- Rail mutations ---
  addRail: (rail: Rail) => void
  updateRailPoints: (id: string, points: Point[]) => void
  updateRailParametricT: (id: string, t: number) => void
  deleteRail: (id: string) => void
  setRailSupply: (id: string, isSupply: boolean) => void
  /** Replace the set of resource types a rail/bus carries (must keep ≥1). */
  setRailResourceTypes: (id: string, resourceTypes: string[], label?: string) => void

  // --- Derived state (solver writes here) ---
  setFeeders: (
    feeders: Feeder[],
    outputConnectors: OutputConnector[],
    missingInputs: Set<string>,
    inputLayouts: Record<string, InputSlot[]>,
    outputLayouts: Record<string, OutputSlot[]>
  ) => void

  // --- Viewport ---
  setViewport: (vt: ViewportTransform) => void
  panBy: (dx: number, dy: number) => void
  zoomTo: (zoom: number, pivotScreen: Point) => void
}

// ============================================================
// Solver recompute signal
// After any authored-state mutation the store calls this.
// The solver subscribes and recomputes when triggered.
// ============================================================
type SolverCallback = () => void
let solverCallback: SolverCallback | null = null

export function registerSolverCallback(cb: SolverCallback): void {
  solverCallback = cb
}

function triggerSolverRecompute(): void {
  if (solverCallback) {
    // Defer to next microtask so the store mutation is fully committed first
    queueMicrotask(solverCallback)
  }
}

// ============================================================
// Store implementation
// ============================================================

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export { generateId }

export const useSceneStore = create<SceneStore>()((set, _get) => ({
  // Initial authored state
  bubbles: {},
  rails: {},

  // Initial derived state
  feeders: [],
  outputConnectors: [],
  missingInputs: new Set<string>(),
  inputLayouts: {},
  outputLayouts: {},

  // Initial viewport
  viewport: { zoom: 1, pan: { x: 0, y: 0 } },

  // --- Bubble mutations ---

  addBubble(bubble) {
    set(state => ({ bubbles: { ...state.bubbles, [bubble.id]: bubble } }))
    triggerSolverRecompute()
  },

  moveBubble(id, position) {
    set(state => {
      const bubble = state.bubbles[id]
      if (!bubble) return state
      return { bubbles: { ...state.bubbles, [id]: { ...bubble, position } } }
    })
    triggerSolverRecompute()
  },

  deleteBubble(id) {
    set(state => {
      const next = { ...state.bubbles }
      delete next[id]
      return { bubbles: next }
    })
    triggerSolverRecompute()
  },

  setBubbleRecipe(id, recipeId, outputBindings) {
    set(state => {
      const bubble = state.bubbles[id]
      if (!bubble) return state
      return {
        bubbles: {
          ...state.bubbles,
          [id]: { ...bubble, recipeId, outputBindings },
        },
      }
    })
    triggerSolverRecompute()
  },

  setBubblePrivate(id, isPrivate) {
    set(state => {
      const bubble = state.bubbles[id]
      if (!bubble) return state
      return {
        bubbles: {
          ...state.bubbles,
          [id]: { ...bubble, isPrivate },
        },
      }
    })
    triggerSolverRecompute()
  },

  setOutputBinding(bubbleId, productId, railId) {
    set(state => {
      const bubble = state.bubbles[bubbleId]
      if (!bubble) return state

      const prevRailId = bubble.outputBindings[productId] ?? null
      const newBindings: Record<string, string | null> = {
        ...bubble.outputBindings,
        [productId]: railId,
      }
      const newBubbles = {
        ...state.bubbles,
        [bubbleId]: { ...bubble, outputBindings: newBindings },
      }

      let newRails = state.rails

      // Remove product from previous rail's resourceTypes if no other bubble binds it there
      if (prevRailId && prevRailId !== railId) {
        const prevRail = state.rails[prevRailId]
        if (prevRail) {
          const stillBound = Object.values(newBubbles).some(
            b => b.id !== bubbleId && b.outputBindings[productId] === prevRailId
          )
          if (!stillBound) {
            const nextTypes = prevRail.resourceTypes.filter(t => t !== productId)
            if (nextTypes.length > 0) {
              newRails = { ...newRails, [prevRailId]: { ...prevRail, resourceTypes: nextTypes } }
            }
            // If rail would have 0 resource types, leave it unchanged (belt-and-suspenders)
          }
        }
      }

      // Add product to new rail's resourceTypes if binding
      if (railId) {
        const rail = newRails[railId]
        if (rail && !rail.resourceTypes.includes(productId)) {
          newRails = {
            ...newRails,
            [railId]: { ...rail, resourceTypes: [...rail.resourceTypes, productId] },
          }
        }
      }

      return { bubbles: newBubbles, rails: newRails }
    })
    triggerSolverRecompute()
  },

  // --- Rail mutations ---

  addRail(rail) {
    set(state => ({ rails: { ...state.rails, [rail.id]: rail } }))
    triggerSolverRecompute()
  },

  updateRailPoints(id, points) {
    set(state => {
      const rail = state.rails[id]
      if (!rail) return state
      return { rails: { ...state.rails, [id]: { ...rail, points } } }
    })
    triggerSolverRecompute()
  },

  updateRailParametricT(id, t) {
    set(state => {
      const rail = state.rails[id]
      if (!rail || !rail.parametricOrigin) return state
      const clamped = Math.max(0, Math.min(1, t))
      return {
        rails: {
          ...state.rails,
          [id]: { ...rail, parametricOrigin: { ...rail.parametricOrigin, t: clamped } },
        },
      }
    })
    triggerSolverRecompute()
  },

  deleteRail(id) {
    set(state => {
      const nextRails = { ...state.rails }
      delete nextRails[id]

      // Clear any bubble outputBindings entries pointing at the deleted rail
      let bubbles = state.bubbles
      let rebound = false
      for (const b of Object.values(state.bubbles)) {
        const hasBinding = Object.values(b.outputBindings).some(rId => rId === id)
        if (hasBinding) {
          if (!rebound) { bubbles = { ...state.bubbles }; rebound = true }
          const newBindings: Record<string, string | null> = {}
          for (const [prod, rId] of Object.entries(b.outputBindings)) {
            newBindings[prod] = rId === id ? null : rId
          }
          bubbles[b.id] = { ...b, outputBindings: newBindings }
        }
      }
      return rebound ? { rails: nextRails, bubbles } : { rails: nextRails }
    })
    triggerSolverRecompute()
  },

  setRailSupply(id, isSupply) {
    set(state => {
      const rail = state.rails[id]
      if (!rail) return state
      return {
        rails: { ...state.rails, [id]: { ...rail, isSupply } },
      }
    })
    triggerSolverRecompute()
  },

  setRailResourceTypes(id, resourceTypes, label) {
    set(state => {
      const rail = state.rails[id]
      if (!rail || resourceTypes.length === 0) return state
      // Drop the explicit label once a bus collapses back to a single type.
      const nextLabel = label !== undefined ? label : resourceTypes.length > 1 ? rail.label : undefined
      return {
        rails: { ...state.rails, [id]: { ...rail, resourceTypes, label: nextLabel } },
      }
    })
    triggerSolverRecompute()
  },

  // --- Derived state ---

  setFeeders(feeders, outputConnectors, missingInputs, inputLayouts, outputLayouts) {
    set(() => ({ feeders, outputConnectors, missingInputs, inputLayouts, outputLayouts }))
  },

  // --- Viewport ---

  setViewport(vt) {
    set(() => ({ viewport: vt }))
  },

  panBy(dx, dy) {
    set(state => ({
      viewport: {
        ...state.viewport,
        pan: {
          x: state.viewport.pan.x + dx,
          y: state.viewport.pan.y + dy,
        },
      },
    }))
  },

  zoomTo(zoom, pivotScreen) {
    set(state => {
      const { zoom: oldZoom, pan } = state.viewport
      // Adjust pan so the world point under pivotScreen stays fixed
      const worldX = (pivotScreen.x - pan.x) / oldZoom
      const worldY = (pivotScreen.y - pan.y) / oldZoom
      return {
        viewport: {
          zoom,
          pan: {
            x: pivotScreen.x - worldX * zoom,
            y: pivotScreen.y - worldY * zoom,
          },
        },
      }
    })
  },
}))

// Selectors for convenience
export const selectBubbles = (s: SceneStore) => s.bubbles
export const selectRails = (s: SceneStore) => s.rails
export const selectFeeders = (s: SceneStore) => s.feeders
export const selectViewport = (s: SceneStore) => s.viewport
export const selectBubbleArray = (s: SceneStore) => Object.values(s.bubbles)
export const selectRailArray = (s: SceneStore) => Object.values(s.rails)
