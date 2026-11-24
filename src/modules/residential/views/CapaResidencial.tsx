// La capa de planta de uso mixto (en PlanSvg, sobre las masas y bajo sus etiquetas, sin tomar el puntero): del edificio
// del nivel elegido, la planta tipo que GFit hace de sus masas (el pasillo, las unidades coloreadas por tipo y el núcleo)
// y las columnas en los cruces de la retícula. Un nivel cuyas masas no dan unidades (un podio) solo muestra columnas.
import { useMemo } from 'react'
import type { Point } from '../../../model/schema.ts'
import { buildingOfLevel } from '../../../engine/buildings.ts'
import { gridOf } from '../../../engine/grid/index.ts'
import { useApp } from '../../../state/store.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { columnas, LADO_COLUMNA } from '../engine/columnas.ts'
import type { Shape } from '../engine/gfit/src/model/geom.ts'
import { solidosDe, useDerivado } from './useDerivado.ts'

const PASILLO = '#ECEAE5'
const NUCLEO = '#8C8C8C'
const COLUMNA = '#2B2D2F'

/** Un Shape de GFit ([x, y], y hacia arriba) como trazo SVG del plano (y hacia abajo). */
const trazo = (s: Shape) => s.filter((r) => r.length >= 3).map((r) => `M${r.map(([x, y]) => `${x},${-y}`).join('L')}Z`).join('')

export function CapaResidencial() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const level = useApp((s) => s.level)
  const building = buildingOfLevel(project, level)
  const d = useDerivado(building?.id)
  const dibujo = useMemo(() => {
    if (!d || !building) return null
    const aqui = new Set(project.masses.filter((m) => m.levelId === level).map((m) => m.id))
    const tipo = d.niveles.find((l) => l.block && aqui.has(l.block) && (l.layout?.units.length ?? 0) > 0) ?? null
    const g = gridOf(project, derived.option)
    const cols: Point[] = g ? columnas(g, solidosDe(project, derived.masses, building.id), d.nucleos) : []
    const color = new Map(project.residential!.tipos.map((t) => [t.id, t.color]))
    return { tipo, cols, color, angulo: g?.angle ?? 0 }
  }, [d, building, project, level, derived])
  if (!dibujo) return null
  const { tipo, cols, color, angulo } = dibujo
  const h = LADO_COLUMNA / 2
  return (
    <g pointerEvents="none" data-capa="residencial">
      {tipo && <path d={trazo(tipo.shape)} fill={PASILLO} stroke="none" />}
      {tipo?.layout?.units.map((u) => (
        <path key={u.id} d={trazo(u.shape)} data-tipo={u.type} fill={color.get(u.type) ?? '#ccc'} stroke="#ffffff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {tipo && <path d={trazo(tipo.cores)} fill={NUCLEO} stroke="none" />}
      {cols.map((c, i) => (
        <rect key={i} data-columna x={c.x - h} y={-c.y - h} width={LADO_COLUMNA} height={LADO_COLUMNA} fill={COLUMNA} transform={angulo ? `rotate(${-angulo} ${c.x} ${-c.y})` : undefined} />
      ))}
    </g>
  )
}
