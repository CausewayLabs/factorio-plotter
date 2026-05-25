/**
 * Toolbar — tool mode switcher and persistence buttons.
 * The product/resource pickers are opened via the editing store and rendered
 * at the App root (outside this transformed toolbar) so their fixed overlays
 * are not positioned relative to the toolbar's translateX transform.
 */
import { useEditingStore } from '../editing/store'
import { useSceneStore } from '../scene/store'
import { exportDiagramJson, importDiagramJson } from '../editing/persistence'
import { triggerManualRecompute } from '../solver/reactivity'

export default function Toolbar() {
  const tool = useEditingStore(s => s.tool)
  const setTool = useEditingStore(s => s.setTool)
  const openRecipeEditor = useEditingStore(s => s.openRecipeEditor)
  const openProductPicker = useEditingStore(s => s.openProductPicker)
  const openResourcePicker = useEditingStore(s => s.openResourcePicker)
  const reset = useEditingStore(s => s.reset)

  const bubbles = useSceneStore(s => s.bubbles)
  const rails = useSceneStore(s => s.rails)
  const addBubble = useSceneStore(s => s.addBubble)
  const addRail = useSceneStore(s => s.addRail)
  const deleteBubble = useSceneStore(s => s.deleteBubble)
  const deleteRail = useSceneStore(s => s.deleteRail)
  const setFeeders = useSceneStore(s => s.setFeeders)

  function handleSelectTool() {
    setTool('select')
    reset()
  }

  function handlePlaceBubble() {
    openProductPicker()
  }

  function handleDrawRail() {
    openResourcePicker()
  }

  async function handleImport() {
    const data = await importDiagramJson()
    if (!data) return
    // Clear existing
    Object.keys(bubbles).forEach(id => deleteBubble(id))
    Object.keys(rails).forEach(id => deleteRail(id))
    setFeeders([], [], new Set(), {})
    // Load new
    data.bubbles.forEach(b => addBubble(b))
    data.rails.forEach(r => addRail(r))
    triggerManualRecompute()
    reset()
  }

  function handleExport() {
    exportDiagramJson(bubbles, rails)
  }

  function handleClear() {
    if (!confirm('Clear the entire diagram?')) return
    Object.keys(bubbles).forEach(id => deleteBubble(id))
    Object.keys(rails).forEach(id => deleteRail(id))
    setFeeders([], [], new Set(), {})
    reset()
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    background: active ? '#4a9eff' : '#2a2a4a',
    color: active ? '#000' : '#e0e0ff',
    border: '1px solid #4a4a6a',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 700 : 400,
  })

  const sepStyle: React.CSSProperties = {
    width: 1,
    height: 24,
    background: '#4a4a6a',
    margin: '0 4px',
  }

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      background: '#16213e',
      border: '1px solid #4a4a6a',
      borderRadius: 8,
      padding: '6px 10px',
      zIndex: 100,
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    }}>
      <span style={{ color: '#8080c0', fontSize: 11, marginRight: 4 }}>Tool:</span>

      <button style={btnStyle(tool === 'select')} onClick={handleSelectTool} title="Select / Pan (S)">
        Select
      </button>
      <button style={btnStyle(tool === 'place-bubble')} onClick={handlePlaceBubble} title="Place Bubble (B)">
        + Bubble
      </button>
      <button style={btnStyle(tool === 'draw-rail')} onClick={handleDrawRail} title="Draw Rail (R)">
        + Rail
      </button>

      <div style={sepStyle} />

      <button style={btnStyle(false)} onClick={() => openRecipeEditor(null)} title="Create or edit products & recipes">
        Recipes
      </button>

      <div style={sepStyle} />

      <button style={btnStyle(false)} onClick={handleImport} title="Import diagram JSON">
        Import
      </button>
      <button style={btnStyle(false)} onClick={handleExport} title="Export diagram JSON">
        Export
      </button>
      <button style={{ ...btnStyle(false), color: '#e06060' }} onClick={handleClear} title="Clear canvas">
        Clear
      </button>

      {/* Tool indicator */}
      <div style={{ marginLeft: 8, color: '#606080', fontSize: 11 }}>
        {tool === 'select' && 'Click to select, drag to pan'}
        {tool === 'place-bubble' && 'Click canvas to place bubble'}
        {tool === 'draw-rail' && 'Click to add points, double-click to finish'}
        {tool === 'fork-rail' && 'Click on a rail to fork it'}
      </div>
    </div>
  )
}
