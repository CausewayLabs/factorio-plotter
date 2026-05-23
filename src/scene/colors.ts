/**
 * Per-resource-type color palette for rail rendering.
 * Each resource type has a consistent color; unknown types fall back to gray.
 */

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
}

export function getResourceColor(resourceType: string): string {
  return RESOURCE_COLORS[resourceType] ?? '#808080'
}
