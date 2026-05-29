# Glossary

*Business and product vocabulary — terms that have a specific meaning in this project's domain. Code-local jargon goes in Codebase Guide instead.*

- **Bubble** — A node on the canvas representing a broad factory concept (an intermediate product such as green/red/blue circuits). Consumes recipe inputs, produces one output, and is itself a source other bubbles can tap. Can be toggled "private" so others cannot draw from it. **UI display name: "Producer."** Code, stores, and these docs keep the name `Bubble`; only user-visible strings say "Producer."
- **Rail** — An authored, typed supply line (the "bus"). Persistent geometry the user draws. Forkable (T-branches, endpoint extension/bending). Has a `supply` toggle: when off, other bubbles ignore it. **UI display name: "Bus."** Code, stores, and these docs keep the name `Rail`; only user-visible strings say "Bus."
- **Feeder** — A derived, auto-routed orthogonal connector from a bubble's unmet input to its nearest matching source (a rail or another bubble's output). Recomputed by the layout solver; never selectable or attachable.
- **Source** — Anything a feeder can attach to: a rail (nearest point on its polyline) or a bubble's output port.
- **Recipe** — A selectable, user-extensible mapping from a product to its inputs. A product may have multiple recipe variants (stock + custom); each bubble points at one. Custom/abstracted recipes (e.g. "green circuit = iron + copper") declutter the graph.
- **Missing requirement** — A bubble state shown when a required input has no matching source on the canvas.
