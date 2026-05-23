import { useEffect } from 'react'
import Canvas from './components/Canvas'
import { useSceneStore, generateId } from './scene/store'

/**
 * App shell with mock data to validate rendering.
 * Hardcoded bubbles + rail so the SVG renderer can be visually verified.
 */
function App() {
  const addBubble = useSceneStore(s => s.addBubble)
  const addRail = useSceneStore(s => s.addRail)
  const bubbles = useSceneStore(s => s.bubbles)

  useEffect(() => {
    // Only inject mock data if store is empty
    if (Object.keys(bubbles).length > 0) return

    // Mock bubbles
    addBubble({
      id: generateId(),
      position: { x: 300, y: 200 },
      productId: 'electronic-circuit',
      recipeVariantId: null,
      isPrivate: false,
    })
    addBubble({
      id: generateId(),
      position: { x: 550, y: 300 },
      productId: 'advanced-circuit',
      recipeVariantId: null,
      isPrivate: false,
    })

    // Mock supply rail for iron-plate
    addRail({
      id: generateId(),
      resourceType: 'iron-plate',
      points: [
        { x: 50, y: 180 },
        { x: 220, y: 180 },
        { x: 220, y: 320 },
      ],
      isSupply: true,
      parametricOrigin: null,
    })

    // Mock non-supply rail
    addRail({
      id: generateId(),
      resourceType: 'copper-plate',
      points: [
        { x: 50, y: 280 },
        { x: 180, y: 280 },
      ],
      isSupply: false,
      parametricOrigin: null,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Canvas />
    </div>
  )
}

export default App
