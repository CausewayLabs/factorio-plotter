import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSceneStore, selectBubbleArray, selectRailArray, selectFeeders, selectViewport, generateId } from '../scene/store'
import { screenToWorld, clampZoom } from '../scene/viewport'
import { hitTest, hitTestRailEndpoint, hitTestBubbleOutputTab, hitTestUnsatisfiedInputTab } from '../editing/hitTest'
import { BUBBLE_RADIUS, resolveRailPolyline, orthogonalConnector, pointOnPolylineAtT } from '../scene/geometry'
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
  const recomputeTeeAnchors = useSceneStore(s => s.recomputeTeeAnchors)
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
  const popDrawingPoint = useEditingStore(s => s.popDrawingPoint)
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
    productId: string
    startPort: Point
    endWorld: Point
    downClient: { x: number; y: number }
    moved: boolean
  } | null>(null)
  /**
   * Active "fill a missing input" drag: started by pressing an unsatisfied input
   * tab. On release in empty space, resolve a recipe producing the needed
   * product and spawn a producer bubble at the drop point. The new bubble's
   * outputs stay unbound — the solver wires the original consumer via the
   * existing bubble-as-feeder-source path.
   */
  const inputFillDrag = useRef<{
    bubbleId: string
    resourceType: string
    startPort: Point
    endWorld: Point
    downClient: { x: number; y: number }
    moved: boolean
  } | null>(null)

  const outputLayouts = useSceneStore(s => s.outputLayouts)
  const inputLayouts = useSceneStore(s => s.inputLayouts)

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
    // While drawing a rail, right-click undoes the last placed vertex (and
    // cancels the rail once the queue is empty). No menus during draw mode.
    if (tool === 'draw-rail') {
      if (drawingPoints.length > 0) {
        popDrawingPoint()
      } else {
        resetEditing()
      }
      return
    }
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
  }, [viewport, bubblesMap, railsMap, tool, drawingPoints])

  const getRecipeById = useRecipeStore(s => s.getRecipeById)
  const getRecipesForProduct = useRecipeStore(s => s.getRecipesForProduct)

  // Ctrl+Z while drawing a rail undoes the most recent vertex. The undo log
  // lives only for the duration of the in-progress rail.
  useEffect(() => {
    if (tool !== 'draw-rail') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (drawingPoints.length > 0) popDrawingPoint()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, drawingPoints, popDrawingPoint])

  // --- Mouse down ---
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (contextMenu) { setContextMenu(null); return }
    if (quickAdd) { setQuickAdd(null); return }

    const screenPt = getSvgPt(e)
    const worldPt = screenToWorld(screenPt, viewport)

    if (e.button === 2) return // handled by onContextMenu

    if (tool === 'select') {
      if (e.button === 0) {
        // Output-tab handle takes top priority: dragging a bubble's output tab
        // emits THAT product onto a bus; dragging the bubble body (below) relocates it.
        const tabHit = hitTestBubbleOutputTab(screenPt, viewport, bubblesMap, outputLayouts)
        if (tabHit) {
          outputDrag.current = {
            bubbleId: tabHit.bubbleId,
            productId: tabHit.productId,
            startPort: tabHit.port,
            endWorld: worldPt,
            downClient: { x: e.clientX, y: e.clientY },
            moved: false,
          }
          return
        }
        // Unsatisfied input tab: drag-to-empty-space spawns a producer bubble.
        const inputHit = hitTestUnsatisfiedInputTab(screenPt, viewport, bubblesMap, inputLayouts)
        if (inputHit) {
          inputFillDrag.current = {
            bubbleId: inputHit.bubbleId,
            resourceType: inputHit.resourceType,
            startPort: inputHit.port,
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
          // Tees are first-class here too — translating a tee shifts its free
          // endpoint (and its stored ray-direction reference) rigidly; the
          // resolver re-derives the junction from the new ray geometry.
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
      }
      // (right-click is intercepted upstream by onContextMenu, which performs
      // the undo for draw-rail mode)
    } else if (tool === 'fork-rail') {
      if (e.button === 0 && forkTarget) {
        // Build a tee off forkTarget. The child stores TWO points:
        //   points[0] = free endpoint (the click, orthogonally snapped so the
        //               child is perpendicular to the parent at the fork).
        //   points[1] = ray-direction reference (the fork point on the
        //               parent at creation time). The resolver casts a ray
        //               from points[0] toward points[1] and intersects with
        //               the live parent polyline; points[1] is never rendered.
        const parent = railsMap[forkTarget.railId]
        if (parent) {
          const parentPoly = resolveRailPolyline(parent, railsMap)
          // Resolve the fork point on the parent at click-time t.
          const forkPt = pointOnPolylineAtT(parentPoly, forkTarget.t)
          // Orthogonal child: snap click to be axis-aligned with the fork point.
          const freeEnd = orthoSnap(forkPt, worldPt)
          const anchorEndIndex: 0 | 1 = forkTarget.t < 0.5 ? 0 : 1
          const rail: Rail = {
            id: generateId(),
            resourceTypes: parent.resourceTypes,
            label: parent.label,
            points: [freeEnd, forkPt],
            isSupply: true,
            tee: { parentRailId: forkTarget.railId, anchorEndIndex },
          }
          addRail(rail)
          autosave(bubblesMap, { ...railsMap, [rail.id]: rail })
        }
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

    // --- Fill-input drag (select mode): pulling out from an unsatisfied input ---
    if (inputFillDrag.current) {
      const drag = inputFillDrag.current
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
        // For a tee, this translates both `points[0]` (the free endpoint) and
        // `points[1]` (the ray-direction reference) by the same vector, so
        // the ray direction is preserved and the resolver re-derives the
        // junction (or elbow) from the new ray geometry.
        const dx = worldPt.x - drag.startWorld.x
        const dy = worldPt.y - drag.startWorld.y
        const next = drag.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy }))
        updateRailPoints(drag.railId, next)
      }
      // After any reshape/translate, the ray geometry may have shifted —
      // refresh tee anchors. If the dragged rail itself is a tee, update its
      // parent's children (= just itself). If the dragged rail is a parent,
      // update its dependents.
      if (rail.tee) recomputeTeeAnchors(rail.tee.parentRailId)
      recomputeTeeAnchors(drag.railId)
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
      if (hitTestBubbleOutputTab(screenPt, viewport, bubblesMap, outputLayouts)) {
        setHoverMode('port')
      } else if (hitTestUnsatisfiedInputTab(screenPt, viewport, bubblesMap, inputLayouts)) {
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
        // The dragged tab carries its own productId — bind THAT product specifically.
        const product = emit.productId
        // Did we drop on an existing rail? Rail hit → bind to it; else create a bus.
        const dropScreen = worldToScreen(emit.endWorld, viewport)
        const hit = hitTest(dropScreen, viewport, bubblesMap, railsMap)
        if (hit?.kind === 'rail') {
          setOutputBinding(b.id, product, hit.id)
          autosave(bubblesMap, railsMap)
        } else {
          // Empty space → create a new single-resource bus starting at the tab port.
          const end = orthoSnap(emit.startPort, emit.endWorld)
          const rail: Rail = {
            id: generateId(),
            resourceTypes: [product],
            label: undefined,
            points: [emit.startPort, end],
            isSupply: true,
          }
          addRail(rail)
          setOutputBinding(b.id, product, rail.id)
          autosave(bubblesMap, railsMap)
        }
      }
    }

    // Finish a fill-input drag: spawn a producer bubble at the drop point.
    const fill = inputFillDrag.current
    inputFillDrag.current = null
    if (fill) setMousePosWorld(p => (p ? { ...p } : p))
    if (fill && fill.moved) {
      const recipes = getRecipesForProduct(fill.resourceType)
      if (recipes.length > 0) {
        const recipe = recipes[0]
        const outputBindings: Record<string, string | null> = {}
        for (const p of recipe.products) outputBindings[p] = null
        const bubble: Bubble = {
          id: generateId(),
          position: fill.endWorld,
          recipeId: recipe.id,
          isPrivate: false,
          outputBindings,
        }
        addBubble(bubble)
        autosave({ ...bubblesMap, [bubble.id]: bubble }, railsMap)
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
    inputFillDrag.current ? 'crosshair' :
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

          {/* Fill-input preview: straight line from the input port to the cursor
              (matches the direct feeder visual that will appear on drop). */}
          {inputFillDrag.current && mousePosWorld && (
            <line
              x1={inputFillDrag.current.startPort.x}
              y1={inputFillDrag.current.startPort.y}
              x2={mousePosWorld.x}
              y2={mousePosWorld.y}
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
              + Producer
            </div>
            <div
              style={{ padding: '5px 14px', cursor: 'pointer', color: '#c0c0d0', fontSize: 13 }}
              onClick={() => { const pt = quickAdd.worldPt; setQuickAdd(null); openResourcePicker(pt) }}
            >
              + Bus
            </div>
          </div>
        </>
      )}
    </>
  )
}

// Re-export screenToWorld for use by editing subsystem
export { screenToWorld }
