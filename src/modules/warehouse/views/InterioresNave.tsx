// mixed-use-mvp: el interior de cada nave en planta (engine/interiores.ts). Programs: maniobras frente a los andenes y
// almacenaje; Furniture: los racks. Sobre las masas, bajo sus nombres, como la planta tipo de uso mixto.
import { useMemo } from 'react'
import type { Polygon } from '../../../model/schema.ts'
import { gridOf } from '../../../engine/grid/index.ts'
import { massesOfOption } from '../../../engine/buildings.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { useInteriors } from '../../../views/show/interiors.ts'
import { interioresNave } from '../engine/interiores.ts'

const ALMACEN = '#E9EDF2', MANIOBRAS = '#F6E7C8', RACK = '#E07A1F'
const trazo = (rings: Polygon[]) => rings.filter((r) => r.length >= 3).map((r) => `M${r.map((q) => `${q.x},${-q.y}`).join('L')}Z`).join('')

export function InterioresNave() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const programas = useInteriors((s) => s.interiors)
  const muebles = useInteriors((s) => s.furniture)
  const naves = useMemo(() => {
    if (!programas && !muebles) return []
    const nave = new Set(project.programs.filter((p) => p.kind === 'warehouse').map((p) => p.id))
    const g = gridOf(project, derived.option)
    // las de la opción que se ve: las demás opciones tienen sus propias naves
    const opcion = project.options.find((o) => o.id === derived.option)
    return (opcion ? massesOfOption(project, opcion) : project.masses)
      .filter((m) => m.programId !== null && nave.has(m.programId) && !derived.masses[m.id]?.context && (derived.masses[m.id]?.polygon.length ?? 0) >= 3)
      .map((m) => ({ id: m.id, ...interioresNave(derived.masses[m.id].polygon, derived.circulation.docks.filter((d) => d.massId === m.id), g?.angle ?? 0) }))
  }, [project, derived, programas, muebles])
  if (!naves.length) return null
  return (
    <g pointerEvents="none" data-capa="naves">
      {naves.map((n) => (
        <g key={n.id} data-nave={n.id}>
          {programas && n.almacen.map((r, i) => <path key={'a' + i} data-almacen d={trazo(r)} fill={ALMACEN} fillRule="evenodd" stroke="none" />)}
          {programas && n.maniobras.map((r, i) => <path key={'m' + i} data-maniobras d={trazo(r)} fill={MANIOBRAS} fillRule="evenodd" stroke="#C9A55B" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />)}
          {/* todos los racks de la nave en un trazo: una nave grande lleva cientos */}
          {muebles && n.racks.length > 0 && <path data-racks={n.racks.length} d={trazo(n.racks)} fill={RACK} fillOpacity={0.85} stroke="#9A4E0E" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
    </g>
  )
}
