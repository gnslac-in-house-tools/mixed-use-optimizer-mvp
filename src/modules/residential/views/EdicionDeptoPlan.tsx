// Editar un departamento dibujado en la planta (spec 2026-11-26-blocks-residenciales): con uno elegido, sobre su
// interior, según el modo (useEdicionDepto): Muros (arrastrar un muro interior), Muebles (arrastrar; doble clic gira),
// Puerta (clic en un muro la pone, en una puerta la quita) o Ventana (clic junto a la fachada la pone, en una la
// quita). Cada cambio, al soltar, es un paso de deshacer que va al tipo o a la unidad (engine/edicionDepto.ts). En el
// mundo de PlanSvg (x, −y), encima de las masas.
import { useState, type PointerEvent as RPointerEvent } from 'react'
import type { Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { CATALOGO, type PlanCatalogo, type Ring } from '../engine/catalogo.ts'
import { deptoColocado } from '../engine/deptos.ts'
import { editarDepto } from '../engine/edicionDepto.ts'
import { agregarPuerta, agregarVentana, ejesMovibles, girarMueble, moverEje, moverMueble, quitarPuerta, quitarVentana, type Eje } from '../engine/editor.ts'
import { contornoDe } from '../engine/tipologias.ts'
import { tramoMuro } from '../engine/edicion3d.ts'
import { useEdicionDepto } from './edicionDepto.ts'

const paso = (v: number) => Math.round(v / 0.05) * 0.05
const ACENTO = '#2F6FED'

type Arrastre = { tipo: 'muro'; eje: Eje; de: number; a: number } | { tipo: 'mueble'; id: string; x: number; y: number }

export function EdicionDeptoPlan({ toWorld, px }: { toWorld: (e: { clientX: number; clientY: number }) => Point; px: number }) {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const massId = useApp((s) => s.selection.massId)
  const { destino, modo } = useEdicionDepto()
  const [arr, setArr] = useState<Arrastre | null>(null)
  const m = massId ? project.masses.find((x) => x.id === massId) : undefined
  const poly = m ? derived.masses[m.id]?.polygon : undefined
  const c = m?.depto && poly ? deptoColocado(project, m, poly) : null
  if (!m || !c || m.locked) return null
  const plan = c.plan
  const w = (x: number, y: number) => { const [X, Y] = c.aMundo(x, y); return `${X},${-Y}` }
  const linea = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => w(x, y)).join('L')
  const anillo = (r: Ring) => linea(r as [number, number][]) + 'Z'
  const local = (e: { clientX: number; clientY: number }) => c.aLocal(toWorld(e))
  const guarda = (editar: (pl: PlanCatalogo) => PlanCatalogo) => useApp.getState().apply((p) => editarDepto(p, m.id, destino, editar))
  // los arrastres avanzan de 5 en 5 cm desde donde estaba (no se pegan a una rejilla absoluta)
  const desde = (id: string, x: number, y: number) => {
    const f = plan.muebles.find((k) => k.id === id)
    return f ? { x: f.x + paso(x - f.x), y: f.y + paso(y - f.y) } : { x, y }
  }
  const toma = (e: RPointerEvent, a: Arrastre) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    setArr(a)
  }
  const mueve = (e: RPointerEvent) => {
    if (!arr) return
    const [x, y] = local(e)
    setArr(arr.tipo === 'muro' ? { ...arr, a: arr.de + paso((arr.eje === 'x' ? x : y) - arr.de) } : { ...arr, ...desde(arr.id, x, y) })
  }
  const suelta = (e: RPointerEvent) => {
    if (!arr) return
    e.stopPropagation()
    const [x, y] = local(e)
    if (arr.tipo === 'muro') {
      const a = arr.de + paso((arr.eje === 'x' ? x : y) - arr.de)
      if (Math.abs(a - arr.de) > 1e-3) guarda((pl) => moverEje(pl, arr.eje, arr.de, a))
    } else {
      const f = plan.muebles.find((k) => k.id === arr.id)
      const q = desde(arr.id, x, y)
      if (f && Math.hypot(q.x - f.x, q.y - f.y) > 1e-3) guarda((pl) => moverMueble(pl, arr.id, q.x, q.y))
    }
    setArr(null)
  }
  const grueso = Math.max(0.35, 10 * px)
  const mov = ejesMovibles(plan)
  return (
    <g data-edicion-depto={m.id} onPointerMove={mueve} onPointerUp={suelta}>
      {/* la zona de la unidad: en Puerta y Ventana, un clic en ella */}
      <path
        data-zona-depto
        d={anillo(contornoDe(plan))}
        fill="transparent"
        stroke={ACENTO}
        strokeWidth={2}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
        pointerEvents={modo === 'puerta' || modo === 'ventana' ? 'all' : 'none'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          const [x, y] = local(e)
          if (modo === 'puerta') guarda((pl) => agregarPuerta(pl, { x, y }))
          if (modo === 'ventana' && y < 0.8) guarda((pl) => agregarVentana(pl, x))
        }}
      />
      {modo === 'muros' &&
        (['x', 'y'] as Eje[]).flatMap((e) =>
          mov[e].map((cc) => {
            const t = tramoMuro(plan, e, cc)
            if (!t) return null
            const en = arr?.tipo === 'muro' && arr.eje === e && Math.abs(arr.de - cc) < 1e-3 ? arr.a : cc
            const pts: [number, number][] = e === 'x' ? [[en, t[0]], [en, t[1]]] : [[t[0], en], [t[1], en]]
            return (
              <g key={e + cc}>
                <path d={linea(pts)} stroke={ACENTO} strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                <path
                  data-muro-depto={`${e}:${cc}`}
                  d={linea(pts)}
                  stroke="transparent"
                  strokeWidth={grueso}
                  style={{ cursor: e === 'x' ? 'ew-resize' : 'ns-resize' }}
                  onPointerDown={(ev) => toma(ev, { tipo: 'muro', eje: e, de: cc, a: cc })}
                >
                  <title>Arrastra el muro</title>
                </path>
              </g>
            )
          }),
        )}
      {modo === 'muebles' &&
        plan.muebles.map((f) => {
          const k = CATALOGO[f.kind] ?? { w: 0.6, d: 0.6 }
          const [fw, fd] = f.rot === 90 || f.rot === 270 ? [k.d, k.w] : [k.w, k.d]
          const x = arr?.tipo === 'mueble' && arr.id === f.id ? arr.x : f.x
          const y = arr?.tipo === 'mueble' && arr.id === f.id ? arr.y : f.y
          const r: Ring = [[x - fw / 2, y - fd / 2], [x + fw / 2, y - fd / 2], [x + fw / 2, y + fd / 2], [x - fw / 2, y + fd / 2]]
          return (
            <path
              key={f.id}
              data-mueble-depto={f.id}
              d={anillo(r)}
              fill={ACENTO}
              fillOpacity={0.12}
              stroke={ACENTO}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'move' }}
              onPointerDown={(ev) => toma(ev, { tipo: 'mueble', id: f.id, x: f.x, y: f.y })}
              onDoubleClick={(ev) => { ev.stopPropagation(); guarda((pl) => girarMueble(pl, f.id)) }}
            >
              <title>{`${CATALOGO[f.kind]?.name ?? f.kind}: arrastra para moverlo; doble clic lo gira`}</title>
            </path>
          )
        })}
      {modo === 'puerta' &&
        (plan.puertas ?? []).map((q, i) => {
          const h = q.ancho / 2
          const pts: [number, number][] = q.eje === 'x' ? [[q.x, q.y - h], [q.x, q.y + h]] : [[q.x - h, q.y], [q.x + h, q.y]]
          return (
            <path key={i} data-puerta-depto={i} d={linea(pts)} stroke="#C2410C" strokeWidth={6} vectorEffect="non-scaling-stroke" style={{ cursor: 'pointer' }}
              onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); guarda((pl) => quitarPuerta(pl, i)) }}>
              <title>Clic: quita la puerta</title>
            </path>
          )
        })}
      {modo === 'ventana' &&
        (plan.ventanas ?? []).map((v, i) => (
          <path key={i} data-ventana-depto={i} d={linea([[v.x - v.ancho / 2, 0], [v.x + v.ancho / 2, 0]])} stroke="#0EA5E9" strokeWidth={6} vectorEffect="non-scaling-stroke" style={{ cursor: 'pointer' }}
            onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); guarda((pl) => quitarVentana(pl, i)) }}>
            <title>Clic: quita la ventana</title>
          </path>
        ))}
    </g>
  )
}
