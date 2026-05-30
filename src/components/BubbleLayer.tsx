import type { Bubble, InputSide, OutputSlot } from '../scene/types'
import { BUBBLE_RADIUS, bubbleInputBox, assignSideIndices } from '../scene/geometry'
import { getResourceColor } from '../scene/colors'
import { useRecipeStore } from '../recipes/store'
import { useSceneStore } from '../scene/store'
import { getIconCoords, resolveRecipeIconId, SPRITE_SIZE, iconsUrl } from '../recipes/iconAtlas'
import type { Recipe } from '../recipes/types'
import { prettify } from '../recipes/labels'

interface Props {
  bubbles: Bubble[]
  selectedIds: Set<string>
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
export default function BubbleLayer({ bubbles, selectedIds }: Props) {
  const resolveRecipe = useRecipeStore(s => s.resolveRecipe)
  const getRecipeById = useRecipeStore(s => s.getRecipeById)
  const missingInputs = useSceneStore(s => s.missingInputs)
  const inputLayouts = useSceneStore(s => s.inputLayouts)
  const outputLayouts = useSceneStore(s => s.outputLayouts)

  return (
    <g className="bubble-layer">
      {bubbles.map(bubble => {
        const recipe = resolveRecipe(bubble.recipeId)
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
          label: getRecipeById(s.type)?.label ?? prettify(s.type),
          satisfied: !missingInputs.has(`${bubble.id}:${s.type}`),
          side: s.side,
          sideIndex: s.sideIndex,
          sideTotal: s.sideTotal,
        }))
        const hasMissing = inputDescs.some(d => !d.satisfied)

        // Primary product drives color and label (products[0] by convention)
        const primaryProduct = recipe?.products[0] ?? bubble.recipeId
        const label = recipe?.label ?? prettify(bubble.recipeId)

        return (
          <BubbleNode
            key={bubble.id}
            bubble={bubble}
            inputs={inputDescs}
            outputs={outputLayouts[bubble.id] ?? []}
            label={label}
            primaryProduct={primaryProduct}
            hasMissing={hasMissing}
            recipe={recipe ?? null}
            selected={selectedIds.has(bubble.id)}
          />
        )
      })}
    </g>
  )
}

interface BubbleNodeProps {
  bubble: Bubble
  inputs: InputDesc[]
  outputs: OutputSlot[]
  label: string
  primaryProduct: string
  hasMissing: boolean
  recipe: Recipe | null
  selected: boolean
}

const UNSAT_COLOR = '#e0556a'

function BubbleNode({ bubble, inputs, outputs, label, primaryProduct, hasMissing, recipe, selected }: BubbleNodeProps) {
  const cx = bubble.position.x
  const cy = bubble.position.y
  const primaryColor = getResourceColor(primaryProduct)

  // Resolve sprite coordinates for the primary product icon.
  const iconId = recipe != null ? resolveRecipeIconId(recipe) : undefined
  const coords = iconId != null ? getIconCoords(iconId) : undefined
  const clipId = `bubble-clip-${bubble.id}`
  const clipR = BUBBLE_RADIUS - 4

  return (
    <g data-bubble-id={bubble.id}>
      {/* Native browser tooltip with the recipe name */}
      <title>{label}</title>

      {/* Clip path used by the sprite icon */}
      {coords != null && (
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={clipR} />
          </clipPath>
        </defs>
      )}

      {/* Selection ring — rendered behind the main circle */}
      {selected && (
        <circle
          cx={cx} cy={cy} r={BUBBLE_RADIUS + 6}
          fill="none"
          stroke="#e0e8ff"
          strokeWidth={1.5}
          strokeDasharray="4,3"
          opacity={0.7}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Main circle — stroke tinted by primary product */}
      <circle
        cx={cx}
        cy={cy}
        r={BUBBLE_RADIUS}
        fill="#16213e"
        stroke={primaryColor}
        strokeWidth={2}
      />

      {/* Sprite icon — full sheet translated so the chosen cell is centred on
          the bubble, clipped to a circle for a clean look.
          Falls back to the truncated text label when no atlas entry exists. */}
      {coords != null ? (
        <image
          href={iconsUrl}
          x={cx - coords.x - SPRITE_SIZE / 2}
          y={cy - coords.y - SPRITE_SIZE / 2}
          clipPath={`url(#${clipId})`}
          style={{ pointerEvents: 'none' }}
        />
      ) : (
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
      )}

      {/* Output tabs — mirror of input tabs. Each tab is a draggable handle:
          drag it to bind that specific product to a bus. Bound = filled; unbound = hollow. */}
      {outputs.map((slot) => {
        const box = bubbleInputBox(bubble.position, slot.side, slot.sideIndex, slot.sideTotal)
        const color = getResourceColor(slot.productId)
        const productLabel = prettify(slot.productId)
        const dy = box.centerY - cy
        const onRim = Math.abs(dy) < BUBBLE_RADIUS
        const rim = onRim ? Math.sqrt(BUBBLE_RADIUS * BUBBLE_RADIUS - dy * dy) : 4
        const arcX = slot.side === 'left' ? cx - rim : cx + rim
        const dim = bubble.isPrivate
        const stroke = dim ? '#808080' : color
        const fillCol = dim ? '#606060' : color
        return (
          <g key={slot.productId}>
            <title>
              {productLabel} — output{slot.isBound ? ' (bound)' : ' (unbound — drag to bind)'}
            </title>
            {/* connector from the bubble to the tab's inner edge (mirror of input connector) */}
            <line
              x1={box.innerX} y1={box.centerY} x2={arcX} y2={box.centerY}
              stroke={stroke} strokeWidth={1.5} opacity={0.85}
            />
            {/* Output tab — pentagon (rectangle + outward-pointing chevron on the
                outer edge). Silhouette alone differentiates from rectangular input
                tabs. The chevron tip IS the emit port (origin of the output connector). */}
            {(() => {
              const tipExt = 8 // how far the chevron extends past the rectangular edge
              const innerLeft = box.x
              const innerRight = box.x + box.width
              const top = box.y
              const bot = box.y + box.height
              const my = box.centerY
              const tipX = slot.side === 'right' ? innerRight + tipExt : innerLeft - tipExt
              const flatX = slot.side === 'right' ? innerRight : innerLeft
              const oppX = slot.side === 'right' ? innerLeft : innerRight
              const pts =
                slot.side === 'right'
                  ? `${oppX},${top} ${flatX},${top} ${tipX},${my} ${flatX},${bot} ${oppX},${bot}`
                  : `${oppX},${top} ${flatX},${top} ${tipX},${my} ${flatX},${bot} ${oppX},${bot}`
              return (
                <polygon
                  points={pts}
                  fill={slot.isBound ? fillCol : '#16213e'}
                  fillOpacity={slot.isBound ? 0.32 : 1}
                  stroke={stroke}
                  strokeWidth={1.5}
                />
              )
            })()}
            {/* product name */}
            <text
              x={slot.side === 'left' ? box.x + box.width - 8 : box.x + 8}
              y={box.centerY}
              textAnchor={slot.side === 'left' ? 'end' : 'start'}
              dominantBaseline="middle"
              fontSize={9.5}
              fill="#e8ecff"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {fitLabel(productLabel, box.width)}
            </text>
          </g>
        )
      })}

      {/* Private indicator */}
      {bubble.isPrivate && (
        <text
          x={cx}
          y={cy + BUBBLE_RADIUS - 4}
          textAnchor="middle"
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

      {/* Recipe dropdown affordance */}
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
