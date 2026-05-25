import type { OutputConnector } from '../scene/types'
import { getResourceColor } from '../scene/colors'

interface Props {
  connectors: OutputConnector[]
}

/**
 * Renders derived output connectors (bubble output → bound bus) as orthogonal
 * polylines. The mirror of FeederLayer: same "derived, non-interactive" rules,
 * but solid (rails/connectors are orthogonal) rather than dashed-direct.
 * Output connectors are NOT interactive — pointer-events: none.
 */
export default function OutputConnectorLayer({ connectors }: Props) {
  return (
    <g className="output-connector-layer" style={{ pointerEvents: 'none' }}>
      {connectors.map(conn => {
        const pts = conn.pathPoints
        if (pts.length < 2) return null

        const color = getResourceColor(conn.resourceType)
        const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ')

        return (
          <polyline
            key={conn.id}
            points={pointsStr}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        )
      })}
    </g>
  )
}
