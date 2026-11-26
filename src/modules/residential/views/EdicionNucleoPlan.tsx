// Editar los elementos de un núcleo en la planta (spec 2026-11-26-blocks-residenciales): con un núcleo elegido, cada
// escalera, elevador, ducto o vestíbulo se arrastra (de 5 en 5 cm, sin salirse del núcleo), un clic lo elige y doble
// clic lo gira 90°. Al soltar, un paso de deshacer (engine/nucleoDetalle.ts). En el mundo de PlanSvg (x, −y).
import { useState, type PointerEvent as RPointerEvent } from 'react'
import type { Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { esquinas, girarElemento, moverElemento, NOMBRES, nucleoColocado } from '../engine/nucleoDetalle.ts'
import { useEdicionNucleo } from './edicionNucleo.ts'
import { usoDe } from './useDerivado.ts'

const paso = (v: number) => Math.round(v / 0.05) * 0.05
const ACENTO = '#2F6FED'

type Arrastre = { id: string; x0: number; y0: number; px: number; py: number; x: number; y: number; movio: boolean }

export function EdicionNucleoPlan({ toWorld }: { toWorld: (e: { clientX: number; clientY: number }) => Point; px: number }) {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const massId = useApp((s) => s.selection.massId)
  const { elegido, elegir } = useEdicionNucleo()
  const [arr, setArr] = useState<Arrastre | null>(null)
  const m = massId ? project.masses.find((x) => x.id === massId) : undefined
  const poly = m ? derived.masses[m.id]?.polygon : undefined
  const c = m && poly && usoDe(project, m.id) === 'nucleo' ? nucleoColocado(m, poly) : null
  if (!m || !c || m.locked) return null
  const w = (x: number, y: number) => { const [X, Y] = c.aMundo(x, y); return `${X},${-Y}` }
  const linea = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => w(x, y)).join('L') + 'Z'
  const local = (e: { clientX: number; clientY: number }) => c.aLocal(toWorld(e))
  const destino = (a: Arrastre, e: { clientX: number; clientY: number }) => {
    const [x, y] = local(e)
    return { x: a.x0 + paso(x - a.px), y: a.y0 + paso(y - a.py) }
  }
  const toma = (e: RPointerEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const el = c.elementos.find((k) => k.id === id)!
    const [px, py] = local(e)
    setArr({ id, x0: el.x, y0: el.y, px, py, x: el.x, y: el.y, movio: false })
  }
  const mueve = (e: RPointerEvent) => {
    if (!arr) return
    const q = destino(arr, e)
    setArr({ ...arr, ...q, movio: arr.movio || Math.hypot(q.x - arr.x0, q.y - arr.y0) > 1e-3 })
  }
  const suelta = (e: RPointerEvent) => {
    if (!arr) return
    e.stopPropagation()
    const q = destino(arr, e)
    if (Math.hypot(q.x - arr.x0, q.y - arr.y0) > 1e-3) useApp.getState().apply((p) => moverElemento(p, m.id, arr.id, q.x, q.y))
    elegir(arr.id)
    setArr(null)
  }
  return (
    <g data-edicion-nucleo={m.id} onPointerMove={mueve} onPointerUp={suelta}>
      {c.elementos.map((el) => {
        const en = arr?.id === el.id ? { ...el, x: arr.x, y: arr.y } : el
        const activo = elegido === el.id || arr?.id === el.id
        return (
          <path
            key={el.id}
            data-elemento-editable={el.id}
            d={linea(esquinas(en))}
            fill={ACENTO}
            fillOpacity={activo ? 0.22 : 0.06}
            stroke={ACENTO}
            strokeWidth={activo ? 2.5 : 1.2}
            strokeDasharray={activo ? undefined : '4 3'}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
            onPointerDown={(ev) => toma(ev, el.id)}
            onDoubleClick={(ev) => { ev.stopPropagation(); useApp.getState().apply((p) => girarElemento(p, m.id, el.id)) }}
          >
            <title>{`${NOMBRES[el.kind]}: arrastra para moverlo; doble clic lo gira`}</title>
          </path>
        )
      })}
    </g>
  )
}
