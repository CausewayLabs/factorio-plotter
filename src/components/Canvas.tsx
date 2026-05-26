import React, { useCallback, useRef, useState } from 'react'
import { useSceneStore, selectBubbleArray, selectRailArray, selectFeeders, selectViewport, generateId } from '../scene/store'
import { screenToWorld, clampZoom } from '../scene/viewport'
import { hitTest, hitTestRailEndpoint, hitTestBubbleOutputPort } from '../editing/hitTest'
import { BUBBLE_RADIUS, resolveRailPolyline, bubbleOutputPort, orthogonalConnector } from '../scene/geometry'
import { useRecipeStore } from '../recipes/store'
import { useEditingStore } from '../editing/store'
import { autosave } from '../editing/persistence'
import RailLayer from './RailLayer'
import BubbleLayer from './BubbleLayer'
import FeederLayer from './FeederLayer'
import OutputConnectorLayer from './OutputConnectorLayer'
import BubbleContextMenu from './BubbleContextMenu'
import RailContextMenu from './RailContextMenu'
import { worldToScreen } from '../scene/types'
import type { Bubble, Rail, Point } from '../scene/types'

interface ContextMenuState {
  kind: 'bubble' | 'rail'
  entity: Bubble | Rail
  screenPos: { x: number; y: number }
  nearestT?: number
}

interface QuickAddState {
  screenPos: { x: number; y: number }
  worldPt: Point
}

/** Lines stop rendering this many world units outside a bubble's circle. */
const BUBBLE_HALO_BUFFER = 15

/**
 * Constrain a new vertex to be orthogonal (horizontal or vertical) relative to
 * the previous vertex by collapsing the smaller delta. Authored rails are always
 * drawn at 90° angles (charter invariant).
 */
function orthoSnap(prev: Point, pt: Point): Point {
  const dx = Math.abs(pt.x - prev.x)
  const dy = Math.abs(pt.y - prev.y)
  return dx >= dy ? { x: pt.x, y: prev.y } : { x: prev.x, y: pt.y }
}

/**
 * The main SVG canvas. Handles pan/zoom and all editing interactions.
 * Draw order: rails → bubbles → feeders → missing-state badges
 * Feeders are NEVER hit-testable (authored/derived boundary invariant).
 */
export default function Canvas() {
  const bubbleArray = useSceneStore(selectBubbleArray)
  const railArray = useSceneStore(selectRailArray)
  const feeders = useSceneStore(selectFeeders)
  const outputConnectors = useSceneStore(s => s.outputConnectors)
  const viewport = useSceneStore(selectViewport)
  const bubblesMap = useSceneStore(s => s.bubbles)
  const railsMap = useSceneStore(s => s.rails)
  const panBy = useSceneStore(s => s.panBy)
  const zoomTo = useSceneStore(s => s.zoomTo)
  const addBubble = useSceneStore(s => s.addBubble)
  const moveBubble = useSceneStore(s => s.moveBubble)
  const addRail = useSceneStore(s => s.addRail)
  const updateRailPoints = useSceneStore(s => s.updateRailPoints)
  const setOutputBinding = useSceneStore(s => s.setOutputBinding)

  const tool = useEditingStore(s => s.tool)
  const pendingRecipeId = useEditingStore(s => s.pendingRecipeId)
  const pendingRailResourceTypes = useEditingStore(s => s.pendingRailResourceTypes)
  const pendingRailLabel = useEditingStore(s => s.pendingRailLabel)
  const drawingPoints = useEditingStore(s => s.drawingPoints)
  const forkTarget = useEditingStore(s => s.forkTarget)
  const openRecipeEditor = useEditingStore(s => s.openRecipeEditor)
  const openProductPicker = useEditingStore(s => s.openProductPicker)
  const openResourcePicker = useEditingStore(s => s.openResourcePicker)
  const addDrawingPoint = useEditingStore(s => s.addDrawingPoint)
  const clearDrawingPoints = useEditingStore(s => s.clearDrawingPoints)
  const resetEditing = useEditingStore(s => s.reset)

  const svgRef = useRef<SVGSVGElement>(null)
  const isPanning = useRef(false)
  const isDraggingBubble = useRef<string | null>(null)
  const lastMouse = useRef({ x: 0, y: 0 })
  const lastClickTime = useRef(0)
  /**
   * Active rail drag (select mode). `mode: 'endpoint'` stretches one end (snapped
   * H/V); `mode: 'move'` translates the whole polyline. `moved` distinguishes a
   * click (→ open context menu on mouseup) from a drag.
   */
  const railDrag = useRef<{
    railId: string
    mode: 'endpoint' | 'move'
    endIndex: number
    origPoints: Point[]
    startWorld: Point
    downClient: { x: number; y: number }
    nearestT: number
    moved: boolean
  } | null>(null)
  /**
   * Active "emit output onto a bus" drag: started by pressing a bubble's output
   * port. On release (if dragged), drop on a rail → bind the bubble's output to
   * that bus (and add its product to the bus); drop on empty space → create a
   * new single-resource rail there and bind to it. The rail is never anchored to
   * the bubble — the solver draws a derived connector between them.
   */
  const outputDrag = useRef<{
    bubbleId: string
    startPort: Point
    endWorld: Point
    downClient: { x: number; y: number }
    moved: boolean
  } | null>(null)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [quickAdd, setQuickAdd] = useState<QuickAddState | null>(null)
  const [mousePosWorld, setMousePosWorld] = useState<{ x: number; y: number } | null>(null)
  // Hover affordance in select mode: 'port' → branch-bus, 'endpoint' → resize,
  // 'rail' → move.
  const [hoverMode, setHoverMode] = useState<'port' | 'endpoint' | 'rail' | null>(null)

  function getSvgPt(e: React.MouseEvent): { x: number; y: number } {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: e.clientX, y: e.clientY }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // --- Context menu (right-click) ---
  const onContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const screenPt = getSvgPt(e)
    const hit = hitTest(screenPt, viewport, bubblesMap, railsMap)
    if (!hit) return

    if (hit.kind === 'bubble') {
      setContextMenu({
        kind: 'bubble',
        entity: bubblesMap[hit.id],
        screenPos: { x: e.clientX, y: e.clientY },
      })
    } else if (hit.kind === 'rail') {
      setContextMenu({
        kind: 'rail',
        entity: railsMap[hit.id],
        screenPos: { x: e.clientX, y: e.clientY },
        nearestT: hit.nearestT,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, bubblesMap, railsMap])

  const getRecipeById = useRecipeStore(s => s.getRecipeById)

  // --- Mouse down ---
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (contextMenu) { setContextMenu(null); return }
    if (quickAdd) { setQuickAdd(null); return }

    const screenPt = getSvgPt(e)
    const worldPt = screenToWorld(screenPt, viewport)

    if (e.button === 2) return // handled by onContextMenu

    if (tool === 'select') {
      if (e.button === 0) {
        // Output-port handle takes top priority: dragging the bubble's output dot
        // emits its output onto a bus; dragging the bubble body (below) relocates it.
        const portBubbleId = hitTestBubbleOutputPort(screenPt, viewport, bubblesMap)
        if (portBubbleId) {
          const b = bubblesMap[portBubbleId]
          const startPort = bubbleOutputPort(b.position)
          outputDrag.current = {
            bubbleId: portBubbleId,
            startPort,
            endWorld: worldPt,
            downClient: { x: e.clientX, y: e.clientY },
            moved: false,
          }
          return
        }
        // Endpoint handles take priority over the rail body so you can grab an
        // end that overlaps the line.
        const endpoint = hitTestRailEndpoint(screenPt, viewport, railsMap)
        if (endpoint) {
          const rail = railsMap[endpoint.railId]
          railDrag.current = {
            railId: endpoint.railId,
            mode: 'endpoint',
            endIndex: endpoint.endIndex,
            origPoints: rail.points.map(p => ({ ...p })),
            startWorld: worldPt,
            downClient: { x: e.clientX, y: e.clientY },
            nearestT: 0,
            moved: false,
          }
          return
        }
        const hit = hitTest(screenPt, viewport, bubblesMap, railsMap)
        if (hit?.kind === 'bubble') {
          isDraggingBubble.current = hit.id
          lastMouse.current = { x: e.clientX, y: e.clientY }
        } else if (hit?.kind === 'rail') {
          // Press on a rail body: a drag relocates the whole rail; a click with
          // no drag opens the materials/context menu (decided on mouseup).
          const rail = railsMap[hit.id]
          railDrag.current = {
            railId: hit.id,
            mode: 'move',
            endIndex: -1,
            origPoints: rail.points.map(p => ({ ...p })),
            startWorld: worldPt,
            downClient: { x: e.clientX, y: e.clientY },
            nearestT: hit.nearestT ?? 0,
            moved: false,
          }
        } else {
          // Pan on empty canvas click
          isPanning.current = true
          lastMouse.current = { x: e.clientX, y: e.clientY }
        }
      }
    } else if (tool === 'place-bubble') {
      if (e.button === 0 && pendingRecipeId) {
        const recipe = getRecipeById(pendingRecipeId)
        const outputBindings: Record<string, string | null> = {}
        for (const p of recipe?.products ?? []) outputBindings[p] = null
        const bubble: Bubble = {
          id: generateId(),
          position: worldPt,
          recipeId: pendingRecipeId,
          isPrivate: false,
          outputBindings,
        }
        addBubble(bubble)
        autosave(
          { ...bubblesMap, [bubble.id]: bubble },
          railsMap
        )
      }
    } else if (tool === 'draw-rail') {
      if (e.button === 0) {
        const now = Date.now()
        const isDoubleClick = now - lastClickTime.current < 350
        lastClickTime.current = now

        if (isDoubleClick && drawingPoints.length >= 1) {
          // Finish rail on double-click
          if (drawingPoints.length >= 2 && pendingRailResourceTypes.length > 0) {
            const rail: Rail = {
              id: generateId(),
              resourceTypes: pendingRailResourceTypes,
              label: pendingRailLabel ?? undefined,
              points: drawingPoints,
              isSupply: true,
              parametricOrigin: null,
            }
            addRail(rail)
            autosave(bubblesMap, { ...railsMap, [rail.id]: rail })
          }
          clearDrawingPoints()
          resetEditing()
        } else {
          // Keep authored rails orthogonal: snap each new vertex to H/V
          // relative to the previous one.
          const last = drawingPoints[drawingPoints.length - 1]
          addDrawingPoint(last ? orthoSnap(last, worldPt) : worldPt)
        }
      } else if (e.button === 2) {
        // Right-click cancels
        clearDrawingPoints()
        resetEditing()
      }
    } else if (tool === 'fork-rail') {
      if (e.button === 0 && forkTarget) {
        // Start a new rail forked from forkTarget
        const parent = railsMap[forkTarget.railId]
        const rail: Rail = {
          id: generateId(),
          resourceTypes: parent?.resourceTypes ?? ['unknown'],
          label: parent?.label,
          points: [worldPt, worldPt], // Will grow as user draws
          isSupply: true,
          parametricOrigin: { parentRailId: forkTarget.railId, t: forkTarget.t },
        }
        addRail(rail)
        autosave(bubblesMap, { ...railsMap, [rail.id]: rail })
        resetEditing()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, viewport, bubblesMap, railsMap, pendingRecipeId, pendingRailResourceTypes, pendingRailLabel, drawingPoints, forkTarget, contextMenu, quickAdd])

  // --- Double-click: quick-add menu on empty canvas (select mode) ---
  const onDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'select') return
    const screenPt = getSvgPt(e)
    const hit = hitTest(screenPt, viewport, bubblesMap, railsMap)
    if (hit) return // double-clicking an existing entity is not an add gesture
    const worldPt = screenToWorld(screenPt, viewport)
    setContextMenu(null)
    setQuickAdd({ screenPos: { x: e.clientX, y: e.clientY }, worldPt })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, viewport, bubblesMap, railsMap])

  // --- Mouse move ---
  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const screenPt = getSvgPt(e)
    const worldPt = screenToWorld(screenPt, viewport)
    setMousePosWorld(worldPt)

    // --- Emit-output drag (select mode): pulling out from a bubble output ---
    if (outputDrag.current) {
      const drag = outputDrag.current
      drag.endWorld = worldPt
      const dxClient = e.clientX - drag.downClient.x
      const dyClient = e.clientY - drag.downClient.y
      if (!drag.moved && Math.abs(dxClient) + Math.abs(dyClient) > 3) drag.moved = true
      return
    }

    // --- Rail drag (select mode): stretch an endpoint or relocate the rail ---
    if (railDrag.current) {
      const drag = railDrag.current
      const rail = railsMap[drag.railId]
      if (!rail) { railDrag.current = null; return }

      const dxClient = e.clientX - drag.downClient.x
      const dyClient = e.clientY - drag.downClient.y
      if (!drag.moved && Math.abs(dxClient) + Math.abs(dyClient) > 3) drag.moved = true

      if (drag.mode === 'endpoint') {
        // Keep the dragged segment orthogonal: snap against its neighbour vertex.
        const resolved = resolveRailPolyline(rail, railsMap)
        const neighborIndex = drag.endIndex === 0 ? 1 : drag.endIndex - 1
        const neighbor = resolved[neighborIndex] ?? worldPt
        const snapped = orthoSnap(neighbor, worldPt)
        const next = drag.origPoints.map(p => ({ ...p }))
        next[drag.endIndex] = snapped
        updateRailPoints(drag.railId, next)
      } else {
        // Relocate: translate the whole polyline by the world-space delta.
        const dx = worldPt.x - drag.startWorld.x
        const dy = worldPt.y - drag.startWorld.y
        const next = drag.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy }))
        updateRailPoints(drag.railId, next)
      }
      if (drag.moved) autosave(bubblesMap, railsMap)
      return
    }

    if (isDraggingBubble.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        const newPos = {
          x: worldPt.x,
          y: worldPt.y,
        }
        moveBubble(isDraggingBubble.current, newPos)
        lastMouse.current = { x: e.clientX, y: e.clientY }
        autosave(bubblesMap, railsMap)
      }
      return
    }

    if (isPanning.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      panBy(dx, dy)
      lastMouse.current = { x: e.clientX, y: e.clientY }
      return
    }

    // Hover affordance (select mode, idle): output port → branch-bus cursor,
    // endpoint handle → resize, rail body → move.
    if (tool === 'select') {
      if (hitTestBubbleOutputPort(screenPt, viewport, bubblesMap)) {
        setHoverMode('port')
      } else if (hitTestRailEndpoint(screenPt, viewport, railsMap)) {
        setHoverMode('endpoint')
      } else {
        const hit = hitTest(screenPt, viewport, bubblesMap, railsMap)
        setHoverMode(hit?.kind === 'rail' ? 'rail' : null)
      }
    } else if (hoverMode !== null) {
      setHoverMode(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, panBy, moveBubble, bubblesMap, railsMap, updateRailPoints, tool, hoverMode])

  // --- Mouse up ---
  const onMouseUp = useCallback(() => {
    isPanning.current = false
    isDraggingBubble.current = null

    // Finish an emit-output drag: bind the bubble's output to a bus.
    const emit = outputDrag.current
    outputDrag.current = null
    // Force a re-render so the preview clears even on a no-move release.
    if (emit) setMousePosWorld(p => (p ? { ...p } : p))
    if (emit && emit.moved) {
      const b = bubblesMap[emit.bubbleId]
      if (b) {
        // Determine which product to bind: use the first unbound product in outputBindings.
        // (The drag gesture always emits the "next available" output slot.)
        const recipe = getRecipeById(b.recipeId)
        const unboundProduct = recipe?.products.find(p => b.outputBindings[p] === null) ?? recipe?.products[0]
        if (unboundProduct) {
          // Did we drop on an existing rail? (Convert the release world point back
          // to screen for hit-testing.) Rail hit → bind to it; else create a bus.
          const dropScreen = worldToScreen(emit.endWorld, viewport)
          const hit = hitTest(dropScreen, viewport, bubblesMap, railsMap)
          if (hit?.kind === 'rail') {
            // setOutputBinding handles adding the product to rail.resourceTypes
            setOutputBinding(b.id, unboundProduct, hit.id)
            autosave(bubblesMap, railsMap)
          } else {
            // Empty space → create a new single-resource bus starting at the output
            // port (so the derived connector is degenerate until things move).
            const end = orthoSnap(emit.startPort, emit.endWorld)
            const rail: Rail = {
              id: generateId(),
              resourceTypes: [unboundProduct],
              label: undefined,
              points: [emit.startPort, end],
              isSupply: true,
              parametricOrigin: null,
            }
            addRail(rail)
            setOutputBinding(b.id, unboundProduct, rail.id)
            autosave(bubblesMap, railsMap)
          }
        }
      }
    }

    const drag = railDrag.current
    railDrag.current = null
    if (drag) {
      if (drag.moved) {
        // Persist the reshaped/relocated rail.
        autosave(bubblesMap, railsMap)
      } else {
        // A click with no drag opens the rail's materials/context menu.
        const rail = railsMap[drag.railId]
        if (rail) {
          setContextMenu({
            kind: 'rail',
            entity: rail,
            screenPos: { x: drag.downClient.x, y: drag.downClient.y },
            nearestT: drag.nearestT,
          })
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubblesMap, railsMap])

  // --- Zoom ---
  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = clampZoom(viewport.zoom * factor)
    const rect = svgRef.current?.getBoundingClientRect()
    const pivotScreen = rect
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : { x: 0, y: 0 }
    zoomTo(newZoom, pivotScreen)
  }, [viewport.zoom, zoomTo])

  // Cursor style based on tool / hover affordance
  const cursorStyle =
    tool === 'place-bubble' ? 'crosshair' :
    tool === 'draw-rail' ? 'crosshair' :
    tool === 'fork-rail' ? 'crosshair' :
    isDraggingBubble.current ? 'grabbing' :
    outputDrag.current ? 'crosshair' :
    hoverMode === 'port' ? 'crosshair' :
    hoverMode === 'endpoint' ? 'crosshair' :
    hoverMode === 'rail' ? 'move' : 'grab'

  // World-space transform string for SVG group
  const transform = `translate(${viewport.pan.x}, ${viewport.pan.y}) scale(${viewport.zoom})`

  return (
    <>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', display: 'block', background: '#1a1a2e', cursor: cursorStyle }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      >
        <g transform={transform}>
          {/* Halo mask: lines (rails + feeders) stop rendering ~15px outside any
              bubble, leaving a clean buffer. White = visible, black = clipped. */}
          <defs>
            <mask id="bubble-halo" maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
              <rect x={-100000} y={-100000} width={200000} height={200000} fill="#fff" />
              {bubbleArray.map(b => (
                <circle key={b.id} cx={b.position.x} cy={b.position.y} r={BUBBLE_RADIUS + BUBBLE_HALO_BUFFER} fill="#000" />
              ))}
            </mask>
          </defs>

          {/* Draw order: (rails → feeders → output connectors, all behind
              bubbles & halo-masked) → bubbles */}
          <g mask="url(#bubble-halo)">
            <RailLayer rails={railArray} viewport={viewport} />
            <FeederLayer feeders={feeders} />
            <OutputConnectorLayer connectors={outputConnectors} />
          </g>
          <BubbleLayer bubbles={bubbleArray} />

          {/* Emit-output preview: orthogonal connector from the output port to the cursor */}
          {outputDrag.current && mousePosWorld && (
            <polyline
              points={orthogonalConnector(outputDrag.current.startPort, mousePosWorld)
                .map(p => `${p.x},${p.y}`)
                .join(' ')}
              fill="none"
              stroke="#4a9eff"
              strokeWidth={3}
              strokeDasharray="6,4"
              opacity={0.6}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* In-progress rail drawing preview (live segment snapped to H/V) */}
          {tool === 'draw-rail' && drawingPoints.length > 0 && mousePosWorld && (
            <polyline
              points={[
                ...drawingPoints,
                orthoSnap(drawingPoints[drawingPoints.length - 1], mousePosWorld),
              ].map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#4a9eff"
              strokeWidth={2}
              strokeDasharray="6,4"
              opacity={0.6}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </g>
      </svg>

      {/* Context menus (outside SVG to avoid transform issues) */}
      {contextMenu?.kind === 'bubble' && (
        <BubbleContextMenu
          bubble={contextMenu.entity as Bubble}
          screenPos={contextMenu.screenPos}
          onClose={() => setContextMenu(null)}
          onOpenRecipeEditor={() => {
            const recipeId = (contextMenu.entity as Bubble).recipeId
            setContextMenu(null)
            openRecipeEditor(recipeId)
          }}
        />
      )}
      {contextMenu?.kind === 'rail' && (
        <RailContextMenu
          rail={contextMenu.entity as Rail}
          screenPos={contextMenu.screenPos}
          nearestT={contextMenu.nearestT ?? 0}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Quick-add menu: double-click empty canvas to add a bubble or rail here */}
      {quickAdd && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setQuickAdd(null)} />
          <div
            style={{
              position: 'fixed',
              top: quickAdd.screenPos.y,
              left: quickAdd.screenPos.x,
              background: '#16213e',
              border: '1px solid #4a4a6a',
              borderRadius: 6,
              padding: '6px 0',
              zIndex: 300,
              minWidth: 150,
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '2px 14px', color: '#606080', fontSize: 10 }}>Add here</div>
            <div
              style={{ padding: '5px 14px', cursor: 'pointer', color: '#c0c0d0', fontSize: 13 }}
              onClick={() => { const pt = quickAdd.worldPt; setQuickAdd(null); openProductPicker(pt) }}
            >
              + Bubble
            </div>
            <div
              style={{ padding: '5px 14px', cursor: 'pointer', color: '#c0c0d0', fontSize: 13 }}
              onClick={() => { const pt = quickAdd.worldPt; setQuickAdd(null); openResourcePicker(pt) }}
            >
              + Rail
            </div>
          </div>
        </>
      )}
    </>
  )
}

// Re-export screenToWorld for use by editing subsystem
export { screenToWorld }
