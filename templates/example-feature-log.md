# Feature Log: Widget Subsystem

*This log tracks planned features, open bugs, and completed work for the widget subsystem. Each entry has a planned date; completed entries also record completion date and decision narrative. Categories organize entries into sub-domains within the log.*

## Core Widget Rendering

- [x] (planned: 2026-01-10, completed: 2026-01-18) Implement basic widget draw loop — decision: chose retained-mode rendering over immediate-mode because widget trees are deep and re-drawing every frame from scratch caused visible jitter on low-end hardware.
- [x] (planned: 2026-01-20, completed: 2026-01-25) Add dirty-flag diffing to skip unchanged widgets — decision: per-node dirty flags rather than a global invalidation pass so unrelated subtrees don't re-render on every state change.
- [ ] (planned: 2026-02-05) Add animation easing presets (ease-in, ease-out, spring)
- [ ] (planned: 2026-02-15) Support fractional scaling for high-DPI displays

## Widget Layout Engine

- [x] (planned: 2026-01-12, completed: 2026-01-22) Implement flexbox-style row/column layout — decision: modeled on CSS flexbox semantics (main axis / cross axis) rather than a custom API so existing web knowledge transfers; gaps and wrapping are supported from the start.
- [ ] (planned: 2026-02-10) Add grid layout container
- [ ] (planned: 2026-03-01) Implement z-index stacking context for overlapping widgets

## Bugs & Fixes

- [x] (planned: 2026-01-28, completed: 2026-01-30) Fixed widget clipping rect not applied during scroll — decision: moved clipping-rect push/pop to the scroll container's render phase rather than the parent frame so nested scroll containers also clip correctly.
- [ ] (planned: 2026-02-08) Investigate focus ring not drawn on keyboard navigation in Safari (reported by QA, reproducible with Tab key only)
