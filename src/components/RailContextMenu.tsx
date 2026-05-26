/**
 * Context menu for rails (buses): edit carried materials, supply toggle, fork, delete.
 * A rail is a bus — it can carry several resource types. Materials can be added
 * and removed here; the solver re-feeds any bubble that needs one of them.
 */
import { useState } from 'react'
import { useSceneStore } from '../scene/store'
import { useRecipeStore } from '../recipes/store'
import { getResourceColor } from '../scene/colors'
import type { Rail } from '../scene/types'
import { useEditingStore } from '../editing/store'

interface Props {
  rail: Rail
  screenPos: { x: number; y: number }
  nearestT: number
  onClose: () => void
}

export default function RailContextMenu({ rail, screenPos, nearestT, onClose }: Props) {
  const liveRail = useSceneStore(s => s.rails[rail.id]) ?? rail
  const setRailSupply = useSceneStore(s => s.setRailSupply)
  const setRailResourceTypes = useSceneStore(s => s.setRailResourceTypes)
  const deleteRail = useSceneStore(s => s.deleteRail)
  const getAllProductIds = useRecipeStore(s => s.getAllProductIds)
  const setTool = useEditingStore(s => s.setTool)
  const setForkTarget = useEditingStore(s => s.setForkTarget)

  const [adding, setAdding] = useState('')

  const materials = liveRail.resourceTypes

  function addMaterial(type: string) {
    const t = type.trim()
    if (!t || materials.includes(t)) { setAdding(''); return }
    setRailResourceTypes(liveRail.id, [...materials, t])
    setAdding('')
  }

  function removeMaterial(type: string) {
    if (materials.length <= 1) return // a bus must carry at least one
    setRailResourceTypes(liveRail.id, materials.filter(m => m !== type))
  }

  function handleToggleSupply() {
    setRailSupply(liveRail.id, !liveRail.isSupply)
    onClose()
  }

  function handleFork() {
    // Order matters: setTool() resets editing state to defaults (clearing
    // forkTarget), so set the tool FIRST and the fork target SECOND.
    setTool('fork-rail')
    setForkTarget({ railId: liveRail.id, t: nearestT })
    onClose()
  }

  function handleDelete() {
    deleteRail(liveRail.id)
    onClose()
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed', top: screenPos.y, left: screenPos.x,
    background: '#16213e', border: '1px solid #4a4a6a', borderRadius: 6,
    padding: '6px 0', zIndex: 300, width: 240,
    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
  }
  const itemStyle: React.CSSProperties = { padding: '5px 14px', cursor: 'pointer', color: '#c0c0d0', fontSize: 13 }
  const sectionStyle: React.CSSProperties = { padding: '2px 14px', color: '#606080', fontSize: 10 }
  const divStyle: React.CSSProperties = { height: 1, background: '#2a2a4a', margin: '4px 0' }

  const allProducts = getAllProductIds()

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={onClose} />
      <div style={menuStyle} onClick={e => e.stopPropagation()}>
        <div style={sectionStyle}>
          {liveRail.label ? `${liveRail.label} bus` : materials.length > 1 ? 'Bus' : 'Rail'}
          {' · '}{materials.length} material{materials.length === 1 ? '' : 's'}
        </div>
        <div style={{ ...sectionStyle, color: '#404060' }}>
          {liveRail.isSupply ? 'Supply (feeders can attach)' : 'Non-supply (decorative)'}
        </div>

        {/* Materials carried — chips with remove */}
        <div style={{ padding: '6px 12px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {materials.map(m => {
            const color = getResourceColor(m)
            return (
              <span
                key={m}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#0f1628', border: `1px solid ${color}`, borderRadius: 10,
                  padding: '1px 4px 1px 7px', fontSize: 10.5, color: '#d8dcf0', maxWidth: '100%',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 7, background: color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m}</span>
                {materials.length > 1 && (
                  <span
                    onClick={() => removeMaterial(m)}
                    title="Remove from bus"
                    style={{ cursor: 'pointer', color: '#8088a0', fontSize: 12, lineHeight: 1, padding: '0 2px' }}
                  >×</span>
                )}
              </span>
            )
          })}
        </div>

        {/* Add a material to the bus */}
        <div style={{ padding: '0 12px 6px', display: 'flex', gap: 4 }}>
          <input
            list="rail-material-list"
            value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addMaterial(adding) }}
            placeholder="+ add material…"
            style={{ flex: 1, minWidth: 0, background: '#0f1628', border: '1px solid #4a4a6a', color: '#e0e0ff', borderRadius: 4, padding: '4px 6px', fontSize: 12 }}
          />
          <datalist id="rail-material-list">
            {allProducts.map(p => <option key={p} value={p} />)}
          </datalist>
          <button
            onClick={() => addMaterial(adding)}
            disabled={!adding.trim()}
            style={{ background: adding.trim() ? '#2a4a7f' : '#1a1a3a', color: adding.trim() ? '#e0e0ff' : '#606080', border: '1px solid #4a4a6a', borderRadius: 4, cursor: adding.trim() ? 'pointer' : 'not-allowed', fontSize: 12, padding: '0 8px' }}
          >
            Add
          </button>
        </div>

        <div style={divStyle} />

        <div style={itemStyle} onClick={handleToggleSupply}>
          {liveRail.isSupply ? 'Disable Supply' : 'Enable Supply'}
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
