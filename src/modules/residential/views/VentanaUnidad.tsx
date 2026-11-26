// La ventana «Departamento» (pieza 3, primera vuelta): el plano de Mi biblioteca abierto en el editor. A la izquierda la
// planta: arrastrar un muro interior lo mueve (los recintos de sus dos lados se estiran); las cotas encadenadas de
// arriba (a lo largo de la fachada) y de la izquierda (el fondo) se teclean y cada una se marca fija (🔒, viaja entera
// con su muro) o movible; con Puerta se pone una puerta en un muro, con Ventana una ventana en la fachada, con Recinto
// se elige un recinto y su uso (el pasillo, «Pasillo»); el grafo de adyacencias se prende y se apaga. A la derecha, la
// unidad en 3D. Cada cambio es un paso de deshacer de GIM (actions.guardarPlan).
import './unidad.css'
import { cuenta, rotuloRecinto } from './rotulos.ts'
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { ROOM_FILL, type PlanCatalogo, type Ring } from '../engine/catalogo.ts'
import { agregarPuerta, agregarVentana, alternarFija, cambiarRecinto, cotas, ejes, grafo, moverEje, quitarPuerta, quitarVentana, USOS_RECINTO, type Eje } from '../engine/editor.ts'
import { useEditorUnidad } from './editorUnidad.ts'
import { contornoDe } from '../engine/tipologias.ts'
import { MuebleSvg } from './PlanMini.tsx'
import { ALTO_MURO, Unidad3d } from './Unidad3d.tsx'

type Modo = 'muros' | 'puerta' | 'ventana' | 'recinto'
const MODOS: { k: Modo; label: string; ayuda: string }[] = [
  { k: 'muros', label: 'Muros', ayuda: 'Arrastra un muro interior; teclea una cota o fíjala con el candado' },
  { k: 'puerta', label: 'Puerta', ayuda: 'Clic en un muro interior pone una puerta; clic en una puerta la quita' },
  { k: 'ventana', label: 'Ventana', ayuda: 'Clic junto a la fachada (abajo) pone una ventana; clic en una ventana la quita' },
  { k: 'recinto', label: 'Recinto', ayuda: 'Clic en un recinto para cambiar su uso (también a Pasillo)' },
]
const PAD = 1.6
const ringD = (r: Ring) => r.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + -p[1]).join('') + 'Z'
const areaDe = (r: Ring) => Math.abs(r.reduce((s, q, i) => { const n = r[(i + 1) % r.length]; return s + q[0] * n[1] - n[0] * q[1] }, 0) / 2)
const paso = (v: number) => Math.round(v / 0.05) * 0.05
const guardar = (plan: PlanCatalogo) => useApp.getState().apply((p) => actions.guardarPlan(p, plan))

function Cota({ eje, i, de, a, largo, fija, plan }: { eje: Eje; i: number; de: number; a: number; largo: number; fija: boolean; plan: PlanCatalogo }) {
  const [txt, setTxt] = useState<string | null>(null)
  const nombre = `${eje === 'x' ? 'Frente' : 'Fondo'} ${i + 1}`
  const aplicar = () => {
    const v = Number((txt ?? '').replace(',', '.'))
    setTxt(null)
    if (!(v > 0) || Math.abs(v - largo) < 1e-3) return
    const L = [0, ...ejes(plan)[eje], eje === 'x' ? plan.w : plan.d]
    // el tramo se estira moviendo su muro de arriba (o el de abajo si arriba está la orilla)
    const q = i + 1 < L.length - 1 ? moverEje(plan, eje, a, de + v) : moverEje(plan, eje, de, a - v)
    if (q !== plan) guardar(q)
  }
  return (
    <div className="flex items-center gap-1" data-cota={`${eje}${i}`}>
      <span className="w-14 text-caption text-ink-secondary">{nombre}</span>
      <input
        aria-label={`Cota ${nombre}`}
        className="h-6 w-16 rounded-control bg-fill px-1 text-label tabular-nums text-ink outline-none focus:bg-hover disabled:text-ink-secondary"
        value={txt ?? largo.toFixed(2)}
        disabled={fija}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTxt(null) }}
      />
      <span className="text-caption text-ink-secondary">m</span>
      <button type="button" className="pressable rounded-control px-1 text-label hover:bg-hover" aria-pressed={fija} aria-label={`${fija ? 'Liberar' : 'Fijar'} ${nombre}`} title={fija ? 'Fija: viaja entera con su muro' : 'Movible'} onClick={() => guardar(alternarFija(plan, eje, i))}>
        {fija ? '🔒' : '🔓'}
      </button>
    </div>
  )
}

function Planta({ plan, modo, verGrafo, verMuebles, sel, setSel }: { plan: PlanCatalogo; modo: Modo; verGrafo: boolean; verMuebles: boolean; sel: number | null; setSel: (k: number | null) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const [arrastre, setArrastre] = useState<{ eje: Eje; de: number; plan: PlanCatalogo } | null>(null)
  const vista = arrastre?.plan ?? plan
  const e = ejes(vista)
  const g = verGrafo ? grafo(vista) : null
  const aPlano = (ev: { clientX: number; clientY: number }) => {
    const s = svg.current
    const m = s?.getScreenCTM()
    if (!s || !m) return null
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse())
    return { x: pt.x, y: -pt.y }
  }
  const suelta = () => { if (arrastre && arrastre.plan !== plan) guardar(arrastre.plan); setArrastre(null) }
  const mueve = (ev: RPointerEvent) => {
    if (!arrastre) return
    const q = aPlano(ev)
    if (!q) return
    setArrastre({ ...arrastre, plan: moverEje(plan, arrastre.eje, arrastre.de, paso(arrastre.eje === 'x' ? q.x : q.y)) })
  }
  const clic = (ev: React.MouseEvent) => {
    const q = aPlano(ev)
    if (!q) return
    if (modo === 'puerta') guardar(agregarPuerta(plan, q))
    else if (modo === 'ventana' && q.y < 0.8) guardar(agregarVentana(plan, q.x))
    else if (modo === 'recinto') setSel(null)
  }
  return (
    <svg
      ref={svg}
      className="plano-unidad h-full w-full touch-none select-none"
      viewBox={`${-PAD} ${-(vista.d + PAD)} ${vista.w + 2 * PAD} ${vista.d + 2 * PAD}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Planta editable de ${vista.name}`}
      onPointerMove={mueve}
      onPointerUp={suelta}
      onPointerLeave={suelta}
      onClick={clic}
    >
      <path d={ringD(contornoDe(vista))} className="pm-outline" />
      {vista.rooms.map((r, k) => (
        <path
          key={k}
          d={ringD(r.shape)}
          fill={ROOM_FILL[r.kind] ?? '#eee'}
          className="pm-room"
          data-recinto={k}
          onClick={modo === 'recinto' ? (ev) => { ev.stopPropagation(); setSel(k) } : undefined}
          style={modo === 'recinto' ? { cursor: 'pointer' } : undefined}
        />
      ))}
      {sel !== null && vista.rooms[sel] && <path d={ringD(vista.rooms[sel].shape)} className="ed-sel" />}
      {verMuebles && <g transform="scale(1,-1)">{vista.muebles.map((f) => <MuebleSvg key={f.id} m={f} />)}</g>}
      <line x1={0} y1={0} x2={vista.w} y2={0} className="pm-facade" />
      {(vista.ventanas ?? []).map((v, i) => (
        <line key={'v' + i} data-ventana={i} x1={v.x - v.ancho / 2} y1={0} x2={v.x + v.ancho / 2} y2={0} className="ed-ventana" onClick={modo === 'ventana' ? (ev) => { ev.stopPropagation(); guardar(quitarVentana(plan, i)) } : undefined} />
      ))}
      {(vista.puertas ?? []).map((q, i) => {
        const h = q.ancho / 2
        const [x1, y1, x2, y2] = q.eje === 'x' ? [q.x, q.y - h, q.x, q.y + h] : [q.x - h, q.y, q.x + h, q.y]
        const arco = q.eje === 'x' ? `M${q.x},${-(q.y - h)} L${q.x + q.ancho},${-(q.y - h)} A${q.ancho},${q.ancho} 0 0 0 ${q.x},${-(q.y + h)}` : `M${q.x - h},${-q.y} L${q.x - h},${-(q.y + q.ancho)} A${q.ancho},${q.ancho} 0 0 1 ${q.x + h},${-q.y}`
        return (
          <g key={'p' + i} data-puerta={i} onClick={modo === 'puerta' ? (ev) => { ev.stopPropagation(); guardar(quitarPuerta(plan, i)) } : undefined}>
            <line x1={x1} y1={-y1} x2={x2} y2={-y2} className="ed-hueco" />
            <path d={arco} className="ed-puerta" />
          </g>
        )
      })}
      {g && (
        <g className="ed-grafo" data-grafo pointerEvents="none">
          {g.aristas.map((a, i) => <line key={i} className={a.puerta ? '' : 'muro'} x1={g.nodos[a.a].x} y1={-g.nodos[a.a].y} x2={g.nodos[a.b].x} y2={-g.nodos[a.b].y} />)}
          {g.nodos.map((n, i) => <circle key={i} cx={n.x} cy={-n.y} r={0.14} />)}
        </g>
      )}
      {vista.rooms.map((r, k) => {
        const xs = r.shape.map((q) => q[0]), ys = r.shape.map((q) => q[1])
        const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2
        // el nombre cabe en su recinto; muy chico, el área se calla
        const { fs, conArea } = rotuloRecinto(r.name, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
        return (
          <g key={'t' + k} className="pu-rotulo">
            <text x={x} y={conArea ? -y - fs * 0.2 : -y + fs * 0.35} fontSize={fs} textAnchor="middle">{r.name}</text>
            {conArea && <text x={x} y={-y + fs * 1.1} fontSize={fs * 0.85} textAnchor="middle" className="pu-area">{areaDe(r.shape).toFixed(1)} m²</text>}
          </g>
        )
      })}
      {modo === 'muros' && (['x', 'y'] as Eje[]).flatMap((eje) =>
        e[eje].map((c) => (
          <line
            key={eje + c}
            data-muro={`${eje}${c}`}
            className={`ed-muro ${eje} ${arrastre?.eje === eje && Math.abs(arrastre.de - c) < 1e-3 ? 'activo' : ''}`}
            x1={eje === 'x' ? c : 0} y1={eje === 'x' ? 0 : -c} x2={eje === 'x' ? c : vista.w} y2={eje === 'x' ? -vista.d : -c}
            onPointerDown={(ev) => { ev.stopPropagation(); (ev.target as Element).setPointerCapture?.(ev.pointerId); setArrastre({ eje, de: c, plan }) }}
          />
        )),
      )}
      <g className="pu-cota">
        {cotas(vista).x.map((c, i) => (
          <g key={'cx' + i}>
            <line x1={c.de} y1={-(vista.d + 0.6)} x2={c.a} y2={-(vista.d + 0.6)} />
            <line x1={c.a} y1={-(vista.d + 0.45)} x2={c.a} y2={-(vista.d + 0.75)} />
            <text x={(c.de + c.a) / 2} y={-(vista.d + 0.75)} fontSize={0.26} textAnchor="middle">{c.largo.toFixed(2)}{c.fija ? ' 🔒' : ''}</text>
          </g>
        ))}
        {cotas(vista).y.map((c, i) => (
          <g key={'cy' + i}>
            <line x1={-0.6} y1={-c.de} x2={-0.6} y2={-c.a} />
            <text x={-0.75} y={-(c.de + c.a) / 2} fontSize={0.26} textAnchor="middle" transform={`rotate(-90 ${-0.75} ${-(c.de + c.a) / 2})`}>{c.largo.toFixed(2)}{c.fija ? ' 🔒' : ''}</text>
          </g>
        ))}
        <text x={vista.w / 2} y={0.7} fontSize={0.28} textAnchor="middle">fachada · {vista.w.toFixed(2)} m</text>
      </g>
    </svg>
  )
}

const hayWebGL = () => typeof window !== 'undefined' && 'WebGLRenderingContext' in window && !/jsdom/i.test(navigator.userAgent)

function Vista3d({ plan }: { plan: PlanCatalogo }) {
  if (!hayWebGL()) return <div className="grid h-full place-items-center text-caption text-ink-secondary">3D no disponible</div>
  const r = Math.max(plan.w, plan.d)
  return (
    <Canvas shadows camera={{ position: [plan.w / 2 + r * 0.9, r * 1.1, r * 0.9], fov: 40 }} aria-label="Departamento en 3D">
      <color attach="background" args={['#f4f4f2']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 14, 6]} intensity={1.6} castShadow />
      <Unidad3d plan={plan} alto={ALTO_MURO} />
      <OrbitControls target={[plan.w / 2, 0.8, -plan.d / 2]} makeDefault />
    </Canvas>
  )
}

export function VentanaUnidad() {
  const id = useEditorUnidad((s) => s.id)
  const plan = useApp((s) => (s.project.residential?.catalogo ?? []).find((x) => x.id === id)) as PlanCatalogo | undefined
  const [modo, setModo] = useState<Modo>('muros')
  const [verGrafo, setVerGrafo] = useState(false)
  const [verMuebles, setVerMuebles] = useState(true)
  const [sel, setSel] = useState<number | null>(null)
  if (!plan) return <p className="p-4 text-body text-ink-secondary">Ese departamento ya no está en Mi biblioteca.</p>
  const c = cotas(plan)
  const total = plan.rooms.reduce((s, r) => s + areaDe(r.shape), 0)
  return (
    <div className="panel flex h-full min-h-0 flex-col gap-2 rounded-panel p-panel-pad" aria-label="Editor de departamento">
      <div className="flex flex-wrap items-center gap-2 pr-10">
        <input
          aria-label="Nombre del departamento"
          className="h-7 w-56 rounded-control bg-fill px-2 text-label text-ink outline-none focus:bg-hover"
          defaultValue={plan.name}
          key={plan.id}
          onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== plan.name) guardar({ ...plan, name: n }) }}
        />
        <span className="text-caption tabular-nums text-ink-secondary">{plan.w.toFixed(2)} × {plan.d.toFixed(2)} m · {total.toFixed(1)} m² · {cuenta(plan.rooms.length, 'recinto', 'recintos')} · {cuenta((plan.puertas ?? []).length, 'puerta', 'puertas')} · {cuenta((plan.ventanas ?? []).length, 'ventana', 'ventanas')}</span>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Herramienta">
          {MODOS.map((m) => (
            <button key={m.k} type="button" title={m.ayuda} aria-pressed={modo === m.k} className={`pressable rounded-control px-2 py-0.5 text-label ${modo === m.k ? 'bg-ink text-on-ink' : 'text-ink hover:bg-hover'}`} onClick={() => { setModo(m.k); setSel(null) }}>
              {m.label}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-1 text-label text-ink"><input type="checkbox" checked={verGrafo} onChange={(e) => setVerGrafo(e.target.checked)} />Grafo</label>
          <label className="flex items-center gap-1 text-label text-ink"><input type="checkbox" checked={verMuebles} onChange={(e) => setVerMuebles(e.target.checked)} />Muebles</label>
        </div>
      </div>
      <p className="text-caption text-ink-secondary">{MODOS.find((m) => m.k === modo)!.ayuda}</p>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1fr_13rem] gap-2">
        <div className="min-h-0 rounded-control bg-panel-sunken">
          <Planta plan={plan} modo={modo} verGrafo={verGrafo} verMuebles={verMuebles} sel={sel} setSel={setSel} />
        </div>
        <div className="min-h-0 overflow-hidden rounded-control bg-panel-sunken">
          <Vista3d plan={plan} />
        </div>
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <h4 className="text-label text-ink">Cotas a lo largo de la fachada</h4>
          {c.x.map((k, i) => <Cota key={`x${i}-${k.largo}`} eje="x" i={i} {...k} plan={plan} />)}
          <h4 className="text-label text-ink">Cotas de fondo</h4>
          {c.y.map((k, i) => <Cota key={`y${i}-${k.largo}`} eje="y" i={i} {...k} plan={plan} />)}
          {modo === 'recinto' && sel !== null && plan.rooms[sel] && (
            <label className="flex flex-col gap-1 text-label text-ink">
              Uso de {plan.rooms[sel].name}
              <select aria-label="Uso del recinto" className="h-7 rounded-control bg-fill px-1 text-label" value={plan.rooms[sel].kind} onChange={(e) => guardar(cambiarRecinto(plan, sel, e.target.value))}>
                {USOS_RECINTO.map((u) => <option key={u.kind} value={u.kind}>{u.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
