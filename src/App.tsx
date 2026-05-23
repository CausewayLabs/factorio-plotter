import { useEffect } from 'react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import { useSceneStore } from './scene/store'
import { loadAutosave } from './editing/persistence'
import { triggerManualRecompute } from './solver/reactivity'

/**
 * App shell. On startup loads the autosaved diagram from localStorage.
 * If no autosave, canvas starts empty.
 */
function App() {
  const addBubble = useSceneStore(s => s.addBubble)
  const addRail = useSceneStore(s => s.addRail)
  const bubbles = useSceneStore(s => s.bubbles)

  useEffect(() => {
    // Only load autosave if store is empty (first mount)
    if (Object.keys(bubbles).length > 0) return

    const saved = loadAutosave()
    if (saved) {
      saved.bubbles.forEach(b => addBubble(b))
      saved.rails.forEach(r => addRail(r))
      triggerManualRecompute()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <Canvas />
      <Toolbar />
    </div>
  )
}

export default App
