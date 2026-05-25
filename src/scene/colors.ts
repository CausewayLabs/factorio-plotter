/**
 * Per-resource-type color palette for rail rendering.
 * Each resource type has a consistent color; unknown types fall back to gray.
 */
import { canonicalProductKey } from '../recipes/normalize'

const RESOURCE_COLORS: Record<string, string> = {
  'iron-plate': '#a0a0b0',
  'copper-plate': '#c87941',
  'coal': '#3a3a3a',
  'stone': '#a09070',
  'crude-oil': '#2a2a2a',
  'steel-plate': '#8090a0',
  'copper-cable': '#e08030',
  'iron-gear-wheel': '#909090',
  'stone-brick': '#b09060',
  'pipe': '#a0b0c0',
  'plastic-bar': '#c0b0e0',
  'sulfur': '#d0c050',
  'electronic-circuit': '#60b040',
  'advanced-circuit': '#d04040',
  'processing-unit': '#4060d0',
  'sulfuric-acid': '#b0c030',
  'battery': '#50b0b0',
  'electric-engine-unit': '#9070a0',
  'flying-robot-frame': '#60a0d0',
  'lubricant': '#90c070',
  'logistic-robot': '#d09030',
  'construction-robot': '#40a060',
  'rocket-fuel': '#e07060',
  'solid-fuel': '#c06030',
  'low-density-structure': '#b0a080',
  'rocket-control-unit': '#6080d0',
  'speed-module': '#a030c0',
  // Fulgora / Space Age
  'scrap': '#929292',
  'concrete': '#6a6a72',
  'ice': '#a8d0e0',
  'holmium-ore': '#d08090',
}

// Canonical-keyed lookup so "Copper Plate" / "copper_plate" resolve to the same
// color as the canonical "copper-plate" key.
const CANONICAL_RESOURCE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(RESOURCE_COLORS).map(([k, v]) => [canonicalProductKey(k), v])
)

export function getResourceColor(resourceType: string): string {
  return CANONICAL_RESOURCE_COLORS[canonicalProductKey(resourceType)] ?? '#808080'
}

/** Neutral color for a multi-resource bus (more than one carried type). */
export const BUS_COLOR = '#c0c4d0'

/**
 * Color for a rail: the resource's color when it carries a single type,
 * otherwise a neutral bus color (the label identifies the bus).
 */
export function getRailColor(rail: { resourceTypes: string[] }): string {
  return rail.resourceTypes.length === 1
    ? getResourceColor(rail.resourceTypes[0])
    : BUS_COLOR
}
