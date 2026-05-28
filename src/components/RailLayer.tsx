import type { Rail, Point } from '../scene/types'
import type { ViewportTransform } from '../scene/types'
import { getRailColor, getRailLabelColor } from '../scene/colors'
import { resolveRailPolyline } from '../scene/geometry'
import { useSceneStore } from '../scene/store'
import { useEditingStore } from '../editing/store'
import { prettify } from '../recipes/labels'

interface Props {
  rails: Rail[]
  viewport: ViewportTransform
}

/**
 * Renders all rails as SVG polylines.
 * Supply rails: solid, full opacity.
 * Non-supply rails: dashed, reduced opacity.
 */
export default function RailLayer({ rails, viewport }: Props) {
  const railsMap = useSceneStore(s => s.rails)
  const tool = useEditingStore(s => s.tool)
  // Endpoint handles are sized in screen pixels so they stay grabbable at any zoom.
  const handleR = 4 / viewport.zoom

  return (
    <g className="rail-layer">
      {rails.map(rail => {
        // Resolve fork origin so the first point tracks its parent rail.
        const points = resolveRailPolyline(rail, railsMap)

        if (points.length < 2) return null

        const color = getRailColor(rail)
        const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ')

        return (
          <g key={rail.id} data-rail-id={rail.id}>
            {/* Shadow/outline for visibility */}
            <polyline
              points={pointsStr}
              fill="none"
              stroke="#000000"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.4}
            />
            {/* Main rail line */}
            <polyline
              points={pointsStr}
              fill="none"
              stroke={color}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={rail.isSupply ? undefined : '12,6'}
              opacity={rail.isSupply ? 1 : 0.6}
            />
            {/* Resource type label at midpoint */}
            <RailLabel rail={{ ...rail, points }} color={getRailLabelColor(rail)} />

            {/* Draggable endpoint handles (select mode). A fork's first point is
                parametric (owned by its parent), so it gets no handle. */}
            {tool === 'select' && (
              <RailEndpointHandles
                points={points}
                color={color}
                radius={handleR}
                showFirst={true}
                showLast={!rail.tee}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

interface HandleProps {
  points: Point[]
  color: string
  radius: number
  showFirst: boolean
  showLast: boolean
}

function RailEndpointHandles({ points, color, radius, showFirst, showLast }: HandleProps) {
  const ends: Point[] = []
  if (showFirst) ends.push(points[0])
  if (showLast) ends.push(points[points.length - 1])
  return (
    <>
      {ends.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={radius}
          fill="#16213e"
          stroke={color}
          strokeWidth={radius * 0.5}
          style={{ pointerEvents: 'none' }}
        />
      ))}
    </>
  )
}

/** Display name for a rail: explicit label, the single type, or "Bus (N)". */
export function railBusLabel(rail: Rail): string {
  if (rail.label) return `${rail.label} (${rail.resourceTypes.length})`
  if (rail.resourceTypes.length === 1) return prettify(rail.resourceTypes[0])
  return `Bus (${rail.resourceTypes.length})`
}

interface LabelProps {
  rail: Rail
  color: string
}

/** Canvas background — knockout fill behind labels (matches Canvas.tsx). */
const CANVAS_BG = '#1a1a2e'
const RAIL_LABEL_FONT = 15
const RAIL_LABEL_BOX_H = RAIL_LABEL_FONT + 6
// On a horizontal rail, lift the label fully above the rail (clearing its
// ~8px shadow stroke plus a gap) so the line never crosses the text. On a
// vertical rail the label keeps its original on-line offset.
const RAIL_HALF = 5
const RAIL_LABEL_GAP = 5

function RailLabel({ rail, color }: LabelProps) {
  const pts = rail.points
  if (pts.length < 2) return null

  // Use midpoint of first segment for label
  const mid = {
    x: (pts[0].x + pts[1].x) / 2,
    y: (pts[0].y + pts[1].y) / 2,
  }
  const text = railBusLabel(rail)
  // Authored rails are orthogonal, so the first segment is strictly H or V.
  const isHorizontal = Math.abs(pts[1].y - pts[0].y) <= Math.abs(pts[1].x - pts[0].x)
  // Horizontal: clear the whole rail (box bottom sits above the rail + gap).
  // Vertical: keep the original on-line offset.
  const cy = isHorizontal
    ? mid.y - (RAIL_HALF + RAIL_LABEL_GAP + RAIL_LABEL_BOX_H / 2)
    : mid.y - 10
  // Background knockout so feeders crossing the label don't slice the text.
  // Width is estimated from glyph count (~0.56em) — exact metrics aren't
  // available in SVG without measuring, and a slightly generous box is fine.
  const boxW = text.length * RAIL_LABEL_FONT * 0.56 + 12

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={mid.x - boxW / 2}
        y={cy - RAIL_LABEL_BOX_H / 2}
        width={boxW}
        height={RAIL_LABEL_BOX_H}
        rx={4}
        fill={CANVAS_BG}
        opacity={0.85}
      />
      <text
        x={mid.x}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={RAIL_LABEL_FONT}
        fill={color}
        style={{ userSelect: 'none' }}
      >
        {text}
      </text>
    </g>
  )
}
