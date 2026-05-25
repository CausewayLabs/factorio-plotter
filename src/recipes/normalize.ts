/**
 * Product/resource identity normalization.
 *
 * Product IDs are authored inconsistently across surfaces — bundled recipes use
 * hyphenated lowercase ("copper-plate"), but users type rail materials and
 * recipe ingredients freehand ("Copper Plate", "copper_plate", "COPPER PLATE").
 * To make source-matching robust, identity is compared by a *canonical key*:
 * case-folded with all hyphens/underscores/whitespace removed. This is a
 * matching aid only — stored IDs and human-facing labels are left untouched.
 */

/**
 * Canonical key for a product/resource id (or label). Case- and
 * separator-insensitive: `copperKey("Copper-Plate") === copperKey("copper plate")`.
 */
export function canonicalProductKey(id: string): string {
  return id.toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * Resolve free-typed text to a known product id, matching case- and
 * hyphen-insensitively against each product's id *and* its label. Returns the
 * canonical (stored) product id, or null if nothing matches.
 *
 * `labelOf` maps a product id to its display label so "Copper Plate" resolves to
 * the "copper-plate" id even though the user never typed the hyphenated form.
 */
export function resolveProductId(
  text: string,
  productIds: string[],
  labelOf: (id: string) => string
): string | null {
  const key = canonicalProductKey(text)
  if (!key) return null
  // Prefer an exact id match, then an exact label match.
  let labelMatch: string | null = null
  for (const id of productIds) {
    if (canonicalProductKey(id) === key) return id
    if (labelMatch === null && canonicalProductKey(labelOf(id)) === key) labelMatch = id
  }
  return labelMatch
}
