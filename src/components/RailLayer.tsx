import type { Rail } from '../scene/types'
import type { ViewportTransform } from '../scene/types'
import { getResourceColor } from '../scene/colors'
import { resolveParametricPoint } from '../scene/geometry'
import { useSceneStore } from '../scene/store'

interface Props {
  rails: Rail[]
  viewport: ViewportTransform
}

/**
 * Renders all rails as SVG polylines.
 * Supply rails: solid, full opacity.
 * Non-supply rails: dashed, reduced opacity.
 */
export default function RailLayer({ rails, viewport: _viewport }: Props) {
  const railsMap = useSceneStore(s => s.rails)

  return (
    <g className="rail-layer">
      {rails.map(rail => {
        // Resolve parametric origin if this is a fork
        let points = rail.points
        if (rail.parametricOrigin) {
          const parent = railsMap[rail.parametricOrigin.parentRailId]
          if (parent) {
            const forkPoint = resolveParametricPoint(parent, rail.parametricOrigin.t)
            // The fork's first point is the resolved parametric point
            points = [forkPoint, ...rail.points.slice(1)]
          }
        }

        if (points.length < 2) return null

        const color = getResourceColor(rail.resourceType)
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
            <RailLabel rail={{ ...rail, points }} color={color} />
          </g>
        )
      })}
    </g>
  )
}

interface LabelProps {
  rail: Rail
  color: string
}

function RailLabel({ rail, color }: LabelProps) {
  const pts = rail.points
  if (pts.length < 2) return null

  // Use midpoint of first segment for label
  const mid = {
    x: (pts[0].x + pts[1].x) / 2,
    y: (pts[0].y + pts[1].y) / 2,
  }

  return (
    <text
      x={mid.x}
      y={mid.y - 8}
      textAnchor="middle"
      fontSize={10}
      fill={color}
      stroke="#1a1a2e"
      strokeWidth={3}
      paintOrder="stroke"
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    >
      {rail.resourceType}
    </text>
  )
}
