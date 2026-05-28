/**
 * Display-name helpers for product/resource ids.
 *
 * Product ids are stored kebab-case ("lithium-plate"). The bundled catalog
 * carries no separate item display names, so the canonical way to render a
 * material's name for the UI is to title-case its id. Shared here so rails,
 * bubbles, and the recipe editor all surface identical text.
 */

/** Turn a resource id like "lithium-plate" into "Lithium Plate". */
export function prettify(id: string): string {
  return id
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
