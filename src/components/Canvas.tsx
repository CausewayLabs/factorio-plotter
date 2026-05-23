import React, { useCallback, useRef, useState } from 'react'
import { useSceneStore, selectBubbleArray, selectRailArray, selectFeeders, selectViewport, generateId } from '../scene/store'
import { screenToWorld, clampZoom } from '../scene/viewport'
import { hitTest } from '../editing/hitTest'
import { useEditingStore } from '../editing/store'
import { autosave } from '../editing/persistence'
import RailLayer from './RailLayer'
import BubbleLayer from './BubbleLayer'
import FeederLayer from './FeederLayer'
import BubbleContextMenu from './BubbleContextMenu'
import RailContextMenu from './RailContextMenu'
import type { Bubble, Rail } from '../scene/types'

interface ContextMenuState {
  kind: 'bubble' | 'rail'
  entity: Bubble | Rail
  screenPos: { x: number; y: number }
  nearestT?: number
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
  const viewport = useSceneStore(selectViewport)
  const bubblesMap = useSceneStore(s => s.bubbles)
  const railsMap = useSceneStore(s => s.rails)
  const panBy = useSceneStore(s => s.panBy)
  const zoomTo = useSceneStore(s => s.zoomTo)
  const addBubble = useSceneStore(s => s.addBubble)
  const moveBubble = useSceneStore(s => s.moveBubble)
  const addRail = useSceneStore(s => s.addRail)

  const tool = useEditingStore(s => s.tool)
  const pendingProductId = useEditingStore(s => s.pendingProductId)
  const pendingVariantId = useEditingStore(s => s.pendingVariantId)
  const pendingRailResourceType = useEditingStore(s => s.pendingRailResourceType)
  const drawingPoints = useEditingStore(s => s.drawingPoints)
  const forkTarget = useEditingStore(s => s.forkTarget)
  const openRecipeEditor = useEditingStore(s => s.openRecipeEditor)
  const addDrawingPoint = useEditingStore(s => s.addDrawingPoint)
  const clearDrawingPoints = useEditingStore(s => s.clearDrawingPoints)
  const resetEditing = useEditingStore(s => s.reset)

  const svgRef = useRef<SVGSVGElement>(null)
  const isPanning = useRef(false)
  const isDraggingBubble = useRef<string | null>(null)
  const lastMouse = useRef({ x: 0, y: 0 })
  const lastClickTime = useRef(0)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [mousePosWorld, setMousePosWorld] = useState<{ x: number; y: number } | null>(null)

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

  // --- Mouse down ---
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (contextMenu) { setContextMenu(null); return }

    const screenPt = getSvgPt(e)
    const worldPt = screenToWorld(screenPt, viewport)

    if (e.button === 2) return // handled by onContextMenu

    if (tool === 'select') {
      if (e.button === 0) {
        const hit = hitTest(screenPt, viewport, bubblesMap, railsMap)
        if (hit?.kind === 'bubble') {
          isDraggingBubble.current = hit.id
          lastMouse.current = { x: e.clientX, y: e.clientY }
        } else {
          // Pan on empty canvas click
          isPanning.current = true
          lastMouse.current = { x: e.clientX, y: e.clientY }
        }
      }
    } else if (tool === 'place-bubble') {
      if (e.button === 0 && pendingProductId) {
        const bubble: Bubble = {
          id: generateId(),
          position: worldPt,
          productId: pendingProductId,
          recipeVariantId: pendingVariantId,
          isPrivate: false,
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
          if (drawingPoints.length >= 2 && pendingRailResourceType) {
            const rail: Rail = {
              id: generateId(),
              resourceType: pendingRailResourceType,
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
          addDrawingPoint(worldPt)
        }
      } else if (e.button === 2) {
        // Right-click cancels
        clearDrawingPoints()
        resetEditing()
      }
    } else if (tool === 'fork-rail') {
      if (e.button === 0 && forkTarget) {
        // Start a new rail forked from forkTarget
        const rail: Rail = {
          id: generateId(),
          resourceType: railsMap[forkTarget.railId]?.resourceType ?? 'unknown',
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
  }, [tool, viewport, bubblesMap, railsMap, pendingProductId, pendingVariantId, pendingRailResourceType, drawingPoints, forkTarget, contextMenu])

  // --- Mouse move ---
  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const screenPt = getSvgPt(e)
    const worldPt = screenToWorld(screenPt, viewport)
    setMousePosWorld(worldPt)

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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, panBy, moveBubble, bubblesMap, railsMap])

  // --- Mouse up ---
  const onMouseUp = useCallback(() => {
    isPanning.current = false
    isDraggingBubble.current = null
  }, [])

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

  // Cursor style based on tool
  const cursorStyle =
    tool === 'place-bubble' ? 'crosshair' :
    tool === 'draw-rail' ? 'crosshair' :
    tool === 'fork-rail' ? 'crosshair' :
    isDraggingBubble.current ? 'grabbing' : 'grab'

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
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      >
        <g transform={transform}>
          {/* Draw order: rails → bubbles → feeders */}
          <RailLayer rails={railArray} viewport={viewport} />
          <BubbleLayer bubbles={bubbleArray} />
          <FeederLayer feeders={feeders} />

          {/* In-progress rail drawing preview */}
          {tool === 'draw-rail' && drawingPoints.length > 0 && mousePosWorld && (
            <polyline
              points={[...drawingPoints, mousePosWorld].map(p => `${p.x},${p.y}`).join(' ')}
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
            const productId = (contextMenu.entity as Bubble).productId
            setContextMenu(null)
            openRecipeEditor(productId)
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
    </>
  )
}

// Re-export screenToWorld for use by editing subsystem
export { screenToWorld }
