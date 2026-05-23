import React, { useCallback, useRef } from 'react'
import { useSceneStore, selectBubbleArray, selectRailArray, selectFeeders, selectViewport } from '../scene/store'
import { screenToWorld, clampZoom } from '../scene/viewport'
import RailLayer from './RailLayer'
import BubbleLayer from './BubbleLayer'
import FeederLayer from './FeederLayer'

/**
 * The main SVG canvas. Handles pan/zoom, and renders:
 *   rails → bubbles → feeders → missing-state badges
 */
export default function Canvas() {
  const bubbles = useSceneStore(selectBubbleArray)
  const rails = useSceneStore(selectRailArray)
  const feeders = useSceneStore(selectFeeders)
  const viewport = useSceneStore(selectViewport)
  const panBy = useSceneStore(s => s.panBy)
  const zoomTo = useSceneStore(s => s.zoomTo)

  const svgRef = useRef<SVGSVGElement>(null)
  const isPanning = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  // --- Pan ---
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only pan on middle mouse or when no editing tool is active
    if (e.button === 1 || e.button === 0) {
      isPanning.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      e.preventDefault()
    }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isPanning.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    panBy(dx, dy)
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }, [panBy])

  const onMouseUp = useCallback(() => {
    isPanning.current = false
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

  // World-space transform string for SVG group
  const transform = `translate(${viewport.pan.x}, ${viewport.pan.y}) scale(${viewport.zoom})`

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', display: 'block', background: '#1a1a2e', cursor: 'grab' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      <g transform={transform}>
        {/* Draw order: rails → bubbles → feeders */}
        <RailLayer rails={rails} viewport={viewport} />
        <BubbleLayer bubbles={bubbles} />
        <FeederLayer feeders={feeders} />
      </g>
    </svg>
  )
}

// Re-export screenToWorld for use by editing subsystem
export { screenToWorld }
