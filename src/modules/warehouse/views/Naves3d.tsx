// mixed-use-mvp: Furniture en las naves en 3D: sus racks (naves3d.ts), visibles cuando la masa se ve por dentro
// (Ghosted), como los departamentos de uso mixto.
import { useEffect, useMemo } from 'react'
import { gridOf } from '../../../engine/grid/index.ts'
import { massesOfOption } from '../../../engine/buildings.ts'
import { seeThrough, useDetail } from '../../../views/detail.ts'
import { useInteriors } from '../../../views/show/interiors.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { interioresNave } from '../engine/interiores.ts'
import { racks3d } from './naves3d.ts'

const RACK = '#E07A1F'

function Racks({ geometry }: { geometry: ReturnType<typeof racks3d> }) {
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={RACK} roughness={0.8} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
    </mesh>
  )
}

export function Naves3d() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const porDentro = useDetail((s) => seeThrough(s.detail))
  const muebles = useInteriors((s) => s.furniture)
  const naves = useMemo(() => {
    if (!muebles || !porDentro) return []
    const nave = new Set(project.programs.filter((p) => p.kind === 'warehouse').map((p) => p.id))
    const g = gridOf(project, derived.option)
    // las de la opción que se ve: las demás opciones tienen sus propias naves
    const opcion = project.options.find((o) => o.id === derived.option)
    return (opcion ? massesOfOption(project, opcion) : project.masses).flatMap((m) => {
      const dm = derived.masses[m.id]
      if (m.programId === null || !nave.has(m.programId) || !dm || dm.polygon.length < 3 || dm.context) return []
      const { racks } = interioresNave(dm.polygon, derived.circulation.docks.filter((d) => d.massId === m.id), g?.angle ?? 0)
      return [{ id: m.id, geometry: racks3d(racks, dm.span[0], dm.span[1] - dm.span[0]) }]
    })
  }, [project, derived, muebles, porDentro])
  if (!naves.length) return null
  return (
    <group name="naves-3d">
      {naves.map((n) => <Racks key={n.id} geometry={n.geometry} />)}
    </group>
  )
}
