/**
 * Bundled multi-resource source presets ("buses").
 *
 * A source preset pre-seeds a rail/bus with a fixed set of resource types so
 * the user can drop, e.g., a Fulgora "scrap" bus in one click and have every
 * bubble that needs one of its recycling outputs draw from it.
 *
 * These are seeds, not law — once a bus exists the user can add/remove
 * materials freely (rail context menu).
 */

export interface SourcePreset {
  id: string
  label: string
  resourceTypes: string[]
}

/**
 * Scrap recycling (Space Age / Fulgora): the 12 direct outputs of the scrap
 * recycling recipe, in descending yield order. Source: Factorio wiki "Scrap".
 */
export const SCRAP_RECYCLING_OUTPUTS: string[] = [
  'iron-gear-wheel',     // 20%
  'solid-fuel',          // 7%
  'concrete',            // 6%
  'ice',                 // 5%
  'stone',               // 4%
  'steel-plate',         // 4%
  'battery',             // 4%
  'copper-cable',        // 3%
  'advanced-circuit',    // 3%
  'processing-unit',     // 2%
  'low-density-structure',// 1%
  'holmium-ore',         // 1%
]

export const SOURCE_PRESETS: SourcePreset[] = [
  { id: 'scrap', label: 'Scrap', resourceTypes: SCRAP_RECYCLING_OUTPUTS },
]
