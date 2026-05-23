import type { Bubble } from '../scene/types'
import { BUBBLE_RADIUS, bubbleInputPort, bubbleOutputPort } from '../scene/geometry'
import { useRecipeStore } from '../recipes/store'

interface Props {
  bubbles: Bubble[]
}

/**
 * Renders all bubbles as SVG circles with labels, output resource indicators,
 * input port markers, and missing-requirement badges.
 */
export default function BubbleLayer({ bubbles }: Props) {
  const resolveRecipe = useRecipeStore(s => s.resolveRecipe)

  return (
    <g className="bubble-layer">
      {bubbles.map(bubble => {
        const recipe = resolveRecipe(bubble.productId, bubble.recipeVariantId)
        const inputs = recipe?.inputs ?? []

        return (
          <BubbleNode
            key={bubble.id}
            bubble={bubble}
            inputs={inputs}
            label={recipe?.label ?? bubble.productId}
          />
        )
      })}
    </g>
  )
}

interface BubbleNodeProps {
  bubble: Bubble
  inputs: string[]
  label: string
}

function BubbleNode({ bubble, inputs, label }: BubbleNodeProps) {
  const cx = bubble.position.x
  const cy = bubble.position.y
  const outputPort = bubbleOutputPort(bubble.position)

  return (
    <g data-bubble-id={bubble.id}>
      {/* Main circle */}
      <circle
        cx={cx}
        cy={cy}
        r={BUBBLE_RADIUS}
        fill="#16213e"
        stroke="#4a9eff"
        strokeWidth={2}
      />

      {/* Label */}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fill="#e0e0ff"
        stroke="#16213e"
        strokeWidth={3}
        paintOrder="stroke"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {label.length > 16 ? label.slice(0, 14) + '…' : label}
      </text>

      {/* Output port — right edge */}
      <circle
        cx={outputPort.x}
        cy={outputPort.y}
        r={5}
        fill={bubble.isPrivate ? '#606060' : '#4a9eff'}
        stroke="#1a1a2e"
        strokeWidth={1.5}
      />
      {/* Private indicator */}
      {bubble.isPrivate && (
        <text
          x={outputPort.x + 8}
          y={outputPort.y + 4}
          fontSize={9}
          fill="#808080"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          priv
        </text>
      )}

      {/* Input ports — left edge */}
      {inputs.map((inputType, idx) => {
        const port = bubbleInputPort(bubble.position, idx, inputs.length)
        return (
          <g key={inputType + idx}>
            <circle
              cx={port.x}
              cy={port.y}
              r={4}
              fill="#1a1a2e"
              stroke="#8080c0"
              strokeWidth={1.5}
            />
            <text
              x={port.x - 8}
              y={port.y + 3}
              textAnchor="end"
              fontSize={8}
              fill="#8080c0"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {inputType.split('-').slice(-1)[0]}
            </text>
          </g>
        )
      })}

      {/* Missing-requirement badge (rendered when bubble has missing inputs) */}
      <MissingBadge bubble={bubble} inputs={inputs} />

      {/* Recipe variant dropdown affordance */}
      <text
        x={cx}
        y={cy + BUBBLE_RADIUS + 14}
        textAnchor="middle"
        fontSize={9}
        fill="#606080"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        ▼
      </text>
    </g>
  )
}

interface MissingBadgeProps {
  bubble: Bubble
  inputs: string[]
}

/** Missing-requirement badge: red dot in top-right of bubble */
function MissingBadge({ bubble, inputs: _inputs }: MissingBadgeProps) {
  // The solver writes missing state into feeders; the badge is shown
  // when any input has no resolved feeder. For now we render the badge
  // conditionally — TASK-005 will wire the actual missing state.
  // The badge renders if the bubble has a 'missing' marker in the store.
  // For TASK-004 we just provide the visual — driven by a placeholder prop.
  const hasMissing = false // Will be driven by solver output in TASK-006

  if (!hasMissing) return null

  return (
    <circle
      cx={bubble.position.x + BUBBLE_RADIUS * 0.7}
      cy={bubble.position.y - BUBBLE_RADIUS * 0.7}
      r={7}
      fill="#e04040"
      stroke="#1a1a2e"
      strokeWidth={1.5}
    />
  )
}
