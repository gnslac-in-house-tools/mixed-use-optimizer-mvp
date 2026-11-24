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
import { usePiso } from './piso.ts'
import './unidad.css'
import { ROOM_FILL, nombreRecinto, type PlanCatalogo } from '../engine/catalogo.ts'
import { interiorDe } from '../engine/pieza4.ts'
import { useInteriors } from '../../../views/show/interiors.ts'
import { MuebleSvg } from './PlanMini.tsx'

const PASILLO = '#ECEAE5'
const NUCLEO = '#8C8C8C'
const COLUMNA = '#2B2D2F'
const SOTANO = '#D9DADC'
const CAJON = '#FFFFFF'
const PASILLO_AUTOS = '#C4C6C9'
const RAMPA = '#E8B04B'

/** Un Shape de GFit ([x, y], y hacia arriba) como trazo SVG del plano (y hacia abajo). */
const trazo = (s: Shape) => s.filter((r) => r.length >= 3).map((r) => `M${r.map(([x, y]) => `${x},${-y}`).join('L')}Z`).join('')

export function CapaResidencial() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const level = useApp((s) => s.level)
  const building = buildingOfLevel(project, level)
  const d = useDerivado(building?.id)
  const piso = usePiso((s) => s.piso)
  const programas = useInteriors((s) => s.interiors)
  const muebles = useInteriors((s) => s.furniture)
  const dibujo = useMemo(() => {
    if (!d || !building) return null
    const aqui = new Set(project.masses.filter((m) => m.levelId === level).map((m) => m.id))
    // el piso elegido en la barra de pisos; sin ninguno, la planta tipo de las masas del nivel elegido
    const sotano = piso === 'sotano' && d.estacionamiento.sotanos > 0 ? d.estacionamiento.plano : null
    const tipo = sotano ? null : typeof piso === 'number' && d.niveles[piso] ? d.niveles[piso] : (d.niveles.find((l) => l.block && aqui.has(l.block) && (l.layout?.units.length ?? 0) > 0) ?? null)
    const g = gridOf(project, derived.option)
    const cols: Point[] = g ? columnas(g, solidosDe(project, derived.masses, building.id), d.nucleos) : []
    const color = new Map(project.residential!.tipos.map((t) => [t.id, t.color]))
    const rampaCalle = d.estacionamiento.sotanos > 0 ? d.estacionamiento.plano.rampa : null
    return { tipo, sotano, cols, color, angulo: g?.angle ?? 0, rampaCalle }
  }, [d, building, project, level, derived, piso])
  if (!dibujo) return null
  const { tipo, sotano, cols, color, angulo, rampaCalle } = dibujo
  const h = LADO_COLUMNA / 2
  return (
    <g pointerEvents="none" data-capa="residencial">
      {sotano && (
        <g data-sotano>
          <path d={trazo(sotano.contorno)} fill={SOTANO} stroke="none" />
          {sotano.pasillos.map((r, i) => <path key={'p' + i} d={trazo([r])} fill={PASILLO_AUTOS} stroke="none" />)}
          {sotano.cajones.map((r, i) => <path key={'c' + i} data-cajon d={trazo([r])} fill={CAJON} stroke="#7A7D82" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />)}
          {sotano.rampas.map((r, i) => <path key={'r' + i} data-rampa d={trazo([r])} fill={RAMPA} stroke="none" />)}
          {sotano.flechas.map((r, i) => <path key={'f' + i} data-flecha d={trazo([r])} fill="#7A7D82" stroke="none" />)}
          {/* como Praktico: un número por cajón, con halo */}
          {sotano.cajones.map((r, i) => {
            const cx = r.reduce((a, q) => a + q[0], 0) / r.length, cy = r.reduce((a, q) => a + q[1], 0) / r.length
            return <text key={'n' + i} data-cajon-n x={cx} y={-cy} fontSize={0.75} textAnchor="middle" dominantBaseline="middle" fill="#55585C" stroke="#fff" strokeWidth={0.18} paintOrder="stroke">{i + 1}</text>
          })}
          {sotano.rampas.length > 0 && (() => {
            const pts = sotano.rampas.flat()
            const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
            return <text data-rampa-rotulo x={cx} y={-cy} fontSize={1} textAnchor="middle" dominantBaseline="middle" fill="#6b4a0f" fontWeight={600}>Rampa ↑</text>
          })()}
          {sotano.nucleos.map((r, i) => <path key={'n' + i} data-nucleo-sotano d={trazo([r])} fill={NUCLEO} stroke="none" />)}
        </g>
      )}
      {tipo && <path d={trazo(tipo.shape)} fill={PASILLO} stroke="none" />}
      {tipo?.layout?.units.map((u) => (
        <path key={u.id} d={trazo(u.shape)} data-tipo={u.type} fill={color.get(u.type) ?? '#ccc'} stroke="#ffffff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {(programas || muebles) && tipo?.layout?.units.map((u) => {
        // pieza 4: el plano de Mi biblioteca de su tipo, estirado al departamento; si no hay, el de GFit (amueblado)
        const it = interiorDe(u, (project.residential?.catalogo ?? []) as PlanCatalogo[])
        if (!it) return null
        const m = it.marco
        return (
          <g key={u.id + '-int'} data-interior={it.fuente}>
            {programas && it.recintos.map((r, k) => {
              const xs = r.shape.flatMap((q) => q.map((p) => p[0])), ys = r.shape.flatMap((q) => q.map((p) => p[1]))
              const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
              const fs = Math.min(0.42, (Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))) / 5)
              return (
                <g key={u.id + '-r' + k}>
                  <path data-recinto-unidad d={trazo(r.shape)} fill={ROOM_FILL[r.kind] ?? '#eee'} stroke="#8a8a8a" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                  {fs > 0.12 && <text x={cx} y={-cy} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill="#3a3a3a">{nombreRecinto(r.kind, r.name)}</text>}
                </g>
              )
            })}
            {muebles && (
              <g transform={`matrix(${m.u[0]} ${-m.u[1]} ${m.v[0]} ${-m.v[1]} ${m.o[0]} ${-m.o[1]})`} className="plano-unidad" data-muebles>
                {it.plan.muebles.map((f) => <MuebleSvg key={f.id} m={f} />)}
              </g>
            )}
          </g>
        )
      })}
      {programas && tipo?.layout?.units.map((u) => <path key={u.id + '-c'} d={trazo(u.shape)} fill="none" stroke={color.get(u.type) ?? '#888'} strokeWidth={3} vectorEffect="non-scaling-stroke" />)}
      {tipo && <path d={trazo(tipo.cores)} fill={NUCLEO} stroke="none" />}
      {/* en el nivel de calle, la rampa del S1 y su boca alta (por ahí sale el auto) */}
      {tipo?.num === 1 && rampaCalle && (
        <g data-rampa-calle-grupo>
          {[rampaCalle.huella, ...rampaCalle.bocaAlta].map((r, i) => <path key={'rc' + i} data-rampa-calle d={trazo([r])} fill={RAMPA} stroke="none" />)}
          {(() => {
            const xs = rampaCalle.huella.map((q) => q[0]), ys = rampaCalle.huella.map((q) => q[1])
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
            return <text data-rampa-rotulo x={cx} y={-cy} fontSize={1} textAnchor="middle" dominantBaseline="middle" fill="#6b4a0f" fontWeight={600}>Rampa ↓</text>
          })()}
        </g>
      )}
      {cols.map((c, i) => (
        <rect key={i} data-columna x={c.x - h} y={-c.y - h} width={LADO_COLUMNA} height={LADO_COLUMNA} fill={COLUMNA} transform={angulo ? `rotate(${-angulo} ${c.x} ${-c.y})` : undefined} />
      ))}
    </g>
  )
}
