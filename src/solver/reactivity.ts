/**
 * Solver reactivity wiring.
 *
 * Connects the scene store's solver-recompute signal to the solver function.
 * Called once at app startup. After that, every authored-state mutation
 * in the store triggers a full solver recompute via queueMicrotask.
 */

import { registerSolverCallback, useSceneStore } from '../scene/store'
import { useRecipeStore } from '../recipes/store'
import { solveScene } from './solver'

/**
 * Wire the solver to the scene store. Call once at app startup.
 * The scene store calls the registered callback (via queueMicrotask)
 * after every authored-state mutation.
 */
export function initSolver(): void {
  registerSolverCallback(runSolverRecompute)
}

/**
 * Full recompute pass. Reads current authored state + recipe data,
 * runs the solver, and writes results back to the store's feeders slot.
 */
function runSolverRecompute(): void {
  const sceneState = useSceneStore.getState()
  const resolveRecipe = useRecipeStore.getState().resolveRecipe

  const { feeders, outputConnectors, missingInputs, inputLayouts, outputLayouts } = solveScene({
    bubbles: sceneState.bubbles,
    rails: sceneState.rails,
    resolveRecipe,
  })

  sceneState.setFeeders(feeders, outputConnectors, missingInputs, inputLayouts, outputLayouts)
}

/**
 * Trigger a one-off manual recompute (useful after recipe store changes
 * that don't flow through the scene store mutation path).
 */
export function triggerManualRecompute(): void {
  runSolverRecompute()
}
