import type { Bubble, InputSide } from '../scene/types'
import { BUBBLE_RADIUS, bubbleInputBox, bubbleOutputPort, assignSideIndices } from '../scene/geometry'
import { getResourceColor } from '../scene/colors'
import { useRecipeStore } from '../recipes/store'
import { useSceneStore } from '../scene/store'

interface Props {
  bubbles: Bubble[]
}

/** Turn a resource id like "copper-plate" into "Copper Plate". */
function prettify(id: string): string {
  return id
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Truncate a label to fit a box of the given pixel width (≈5.4px/char at 9.5pt). */
function fitLabel(label: string, width: number): string {
  const max = Math.max(4, Math.floor((width - 14) / 5.4))
  return label.length > max ? label.slice(0, max - 1) + '…' : label
}

interface InputDesc {
  type: string
  label: string
  satisfied: boolean
  side: InputSide
  sideIndex: number
  sideTotal: number
}

/**
 * Renders all bubbles as SVG circles with labels, output resource indicators,
 * staggered input tabs (satisfied/unsatisfied styled), and missing badges.
 */
export default function BubbleLayer({ bubbles }: Props) {
  const resolveRecipe = useRecipeStore(s => s.resolveRecipe)
  const missingInputs = useSceneStore(s => s.missingInputs)
  const inputLayouts = useSceneStore(s => s.inputLayouts)

  return (
    <g className="bubble-layer">
      {bubbles.map(bubble => {
        const recipe = resolveRecipe(bubble.productId, bubble.recipeVariantId)
        const inputs = recipe?.inputs ?? []
        // Prefer the solver's side assignment; before the first solve (or if it
        // is stale) fall back to an all-left layout so tabs still render.
        const layout = inputLayouts[bubble.id]
        const sided =
          layout && layout.length === inputs.length
            ? inputs.map((res, i) => ({
                type: res,
                side: layout[i].side,
                sideIndex: layout[i].sideIndex,
                sideTotal: layout[i].sideTotal,
              }))
            : assignSideIndices(inputs.map(res => ({ type: res, side: 'left' as InputSide })))
        const inputDescs: InputDesc[] = sided.map(s => ({
          type: s.type,
          label: resolveRecipe(s.type, null)?.label ?? prettify(s.type),
          satisfied: !missingInputs.has(`${bubble.id}:${s.type}`),
          side: s.side,
          sideIndex: s.sideIndex,
          sideTotal: s.sideTotal,
        }))
        const hasMissing = inputDescs.some(d => !d.satisfied)

        return (
          <BubbleNode
            key={bubble.id}
            bubble={bubble}
            inputs={inputDescs}
            label={recipe?.label ?? bubble.productId}
            hasMissing={hasMissing}
          />
        )
      })}
    </g>
  )
}

interface BubbleNodeProps {
  bubble: Bubble
  inputs: InputDesc[]
  label: string
  hasMissing: boolean
}

const UNSAT_COLOR = '#e0556a'

function BubbleNode({ bubble, inputs, label, hasMissing }: BubbleNodeProps) {
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

      {/* Input tabs — placed on the side its feeder arrives from, staggered
          outward per side so feeder drops never overlap.
          Satisfied = tinted/colored in the resource hue; unsatisfied = hollow + red dashed. */}
      {inputs.map((input, idx) => {
        const box = bubbleInputBox(bubble.position, input.side, input.sideIndex, input.sideTotal)
        const color = getResourceColor(input.type)
        const sat = input.satisfied
        const accent = sat ? color : UNSAT_COLOR
        // Connector from the tab's inner edge to the circle's outline at this y,
        // on whichever side the tab sits.
        const dy = box.centerY - cy
        const onRim = Math.abs(dy) < BUBBLE_RADIUS
        const rim = onRim ? Math.sqrt(BUBBLE_RADIUS * BUBBLE_RADIUS - dy * dy) : 4
        const arcX = input.side === 'left' ? cx - rim : cx + rim
        return (
          <g key={input.type + idx}>
            <title>{input.label}{sat ? '' : ' — unsatisfied (no source)'}</title>
            {/* connector to the bubble */}
            <line
              x1={box.innerX} y1={box.centerY} x2={arcX} y2={box.centerY}
              stroke={accent} strokeWidth={1.5} opacity={0.85}
            />
            {/* tab box */}
            <rect
              x={box.x} y={box.y} width={box.width} height={box.height} rx={4}
              fill={sat ? color : '#241420'}
              fillOpacity={sat ? 0.22 : 1}
              stroke={accent}
              strokeWidth={1.5}
              strokeDasharray={sat ? undefined : '3,2'}
            />
            {/* feeder attach point (left edge) */}
            <circle
              cx={box.port.x} cy={box.port.y} r={3}
              fill={sat ? color : '#241420'}
              stroke={sat ? '#16213e' : UNSAT_COLOR}
              strokeWidth={1}
            />
            {/* full input name */}
            <text
              x={box.x + 8} y={box.centerY}
              textAnchor="start" dominantBaseline="middle"
              fontSize={9.5}
              fill={sat ? '#e8ecff' : '#f0a8b4'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {fitLabel(input.label, box.width)}
            </text>
          </g>
        )
      })}

      {/* Missing-requirement badge (rendered when bubble has missing inputs) */}
      <MissingBadge bubble={bubble} hasMissing={hasMissing} />

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
  hasMissing: boolean
}

/** Missing-requirement badge: red dot in top-right of bubble */
function MissingBadge({ bubble, hasMissing }: MissingBadgeProps) {
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
