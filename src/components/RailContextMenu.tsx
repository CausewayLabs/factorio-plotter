/**
 * Context menu for rails: supply toggle, fork, delete.
 */
import { useSceneStore } from '../scene/store'
import type { Rail } from '../scene/types'
import { useEditingStore } from '../editing/store'

interface Props {
  rail: Rail
  screenPos: { x: number; y: number }
  nearestT: number
  onClose: () => void
}

export default function RailContextMenu({ rail, screenPos, nearestT, onClose }: Props) {
  const setRailSupply = useSceneStore(s => s.setRailSupply)
  const deleteRail = useSceneStore(s => s.deleteRail)
  const setTool = useEditingStore(s => s.setTool)
  const setForkTarget = useEditingStore(s => s.setForkTarget)

  function handleToggleSupply() {
    setRailSupply(rail.id, !rail.isSupply)
    onClose()
  }

  function handleFork() {
    setForkTarget({ railId: rail.id, t: nearestT })
    setTool('fork-rail')
    onClose()
  }

  function handleDelete() {
    deleteRail(rail.id)
    onClose()
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: screenPos.y,
    left: screenPos.x,
    background: '#16213e',
    border: '1px solid #4a4a6a',
    borderRadius: 6,
    padding: '6px 0',
    zIndex: 300,
    minWidth: 180,
    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
  }

  const itemStyle: React.CSSProperties = {
    padding: '5px 14px',
    cursor: 'pointer',
    color: '#c0c0d0',
    fontSize: 13,
  }

  const sectionStyle: React.CSSProperties = {
    padding: '2px 14px',
    color: '#606080',
    fontSize: 10,
  }

  const divStyle: React.CSSProperties = { height: 1, background: '#2a2a4a', margin: '4px 0' }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={onClose} />
      <div style={menuStyle} onClick={e => e.stopPropagation()}>
        <div style={sectionStyle}>Rail: {rail.resourceType}</div>
        <div style={{ ...sectionStyle, fontSize: 10, color: '#404060' }}>
          {rail.isSupply ? 'Supply (feeders can attach)' : 'Non-supply (decorative)'}
        </div>
        <div style={divStyle} />

        <div style={itemStyle} onClick={handleToggleSupply}>
          {rail.isSupply ? 'Disable Supply' : 'Enable Supply'}
        </div>
        <div style={itemStyle} onClick={handleFork}>
          Fork Rail (T-branch)
        </div>
        <div style={divStyle} />
        <div style={{ ...itemStyle, color: '#e06060' }} onClick={handleDelete}>
          Delete Rail
        </div>
      </div>
    </>
  )
}
