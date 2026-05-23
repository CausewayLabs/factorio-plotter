import type { Feeder } from '../scene/types'
import { getResourceColor } from '../scene/colors'

interface Props {
  feeders: Feeder[]
}

/**
 * Renders all derived feeders as thin orthogonal polylines.
 * Feeders are visually distinct from rails: thinner, partially transparent.
 * Feeders are NOT interactive — pointer-events: none.
 */
export default function FeederLayer({ feeders }: Props) {
  return (
    <g className="feeder-layer" style={{ pointerEvents: 'none' }}>
      {feeders.map(feeder => {
        const pts = feeder.pathPoints
        if (pts.length < 2) return null

        const color = getResourceColor(feeder.resourceType)
        const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ')

        return (
          <polyline
            key={feeder.id}
            points={pointsStr}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7}
            strokeDasharray="4,3"
          />
        )
      })}
    </g>
  )
}
