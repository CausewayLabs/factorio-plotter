# Subsystem: Recipes

*This document describes the conceptual design of the recipes subsystem: the data that tells a bubble what it consumes. It is paired with `recipes-log.md`. Read the architecture spine (`architecture.md`) first.*

## Purpose & Role

Owns the catalog of **products** (what bubbles can represent) and the mapping from each product to its inputs. A product can have **multiple recipe variants**; one is the default and a bubble points at exactly one. Because the bundled set is a small curated seed (not a full Factorio scrape), the user is a **first-class author**: they can define brand-new products and their recipes, not merely tweak existing ones. This subsystem is the source of truth the solver reads to know which feeders a bubble needs.

## Key Design Points

Both the **product catalog** and its **recipes** are user-extensible — nothing is fixed. Three layers compose:

1. **Bundled set** — a small static JSON of curated core products + recipes, shipped with the app (hand-seeded, not a full Factorio scrape). Read-only.
2. **User set** — user-authored content that **merges on top** of the bundled set, of two kinds:
   - *New products* the bundled set never had, each with its own recipe(s).
   - *New recipe variants* / abstractions for existing products (e.g. "green circuit = iron + copper", flattening copper wire) that appear alongside stock variants in the dropdown.
3. **Per-bubble pointer** — each bubble references a product + which recipe variant it currently uses; switching is a dropdown on the bubble.

Authoring a product and authoring a recipe are the same flow: name the product, list its input resource types. A product whose recipe is empty is a **raw/base resource** (a leaf — nothing feeds it). Inputs are named by resource type only (no quantities/rates — we model *shape*, not throughput). Resource-type names are just strings; referencing a new resource name in a recipe implicitly makes it available as a rail/source type. A custom recipe deliberately lets the user collapse a multi-step chain into the few resources they want to see, to declutter the graph.

See `recipes-log.md` for planned work.
