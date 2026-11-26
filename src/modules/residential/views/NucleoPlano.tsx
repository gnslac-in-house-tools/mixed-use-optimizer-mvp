// Un núcleo con detalle en la planta (spec 2026-11-26-blocks-residenciales): su contorno y sus elementos en el mundo de
// PlanSvg (x, −y). La escalera: dos tramos con sus huellas (cada 28 cm), el descanso y la flecha de subida; el
// elevador: su cubo con la cruz de la cabina y la puerta; el ducto: achurado; el vestíbulo: su piso y su nombre.
import type { ReactNode } from 'react'
import { esquinas, NOMBRES, type ElementoNucleo, type NucleoColocado } from '../engine/nucleoDetalle.ts'

const MURO = '#3A3A3A'
const PISO = '#F4F3EF'
const HUELLA = 0.28

export function NucleoSvg({ c, contorno }: { c: NucleoColocado; contorno?: boolean }) {
  const w = (x: number, y: number) => { const [X, Y] = c.aMundo(x, y); return `${X},${-Y}` }
  const linea = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => w(x, y)).join('L')
  const caja: [number, number][] = [[0, 0], [c.W, 0], [c.W, c.D], [0, c.D]]
  return (
    <g data-nucleo-detalle>
      {contorno !== false && <path d={linea(caja) + 'Z'} fill={PISO} stroke={MURO} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
      {c.elementos.map((e) => <Elemento key={e.id} e={e} linea={linea} w={w} />)}
    </g>
  )
}

/** Un punto del marco del elemento (u a lo largo de su `w`, v a lo hondo de su `d`, desde su esquina) en el del núcleo. */
function enNucleo(e: ElementoNucleo, u: number, v: number): [number, number] {
  const lu = u - e.w / 2, lv = v - e.d / 2
  switch (e.rot) {
    case 90: return [e.x - lv, e.y + lu]
    case 180: return [e.x - lu, e.y - lv]
    case 270: return [e.x + lv, e.y - lu]
    default: return [e.x + lu, e.y + lv]
  }
}

function Elemento({ e, linea, w }: { e: ElementoNucleo; linea: (pts: [number, number][]) => string; w: (x: number, y: number) => string }) {
  const L = (pts: [number, number][]) => linea(pts.map(([u, v]) => enNucleo(e, u, v)))
  const borde = linea(esquinas(e)) + 'Z'
  const trazo = { fill: 'none', stroke: '#555', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' as const }
  let dentro: ReactNode = null
  if (e.kind === 'escalera') {
    // dos tramos lado a lado (a lo hondo), su descanso al fondo y la flecha de subida en el primero
    const t = e.w / 2, descanso = Math.min(1.2, e.d * 0.25)
    const huellas: ReactNode[] = []
    for (let v = HUELLA, k = 0; v < e.d - descanso - 1e-6; v += HUELLA, k++) {
      huellas.push(<path key={'a' + k} data-huella d={L([[0, v], [t, v]])} {...trazo} />)
      huellas.push(<path key={'b' + k} data-huella d={L([[t, v], [e.w, v]])} {...trazo} />)
    }
    dentro = (
      <>
        {huellas}
        <path d={L([[t, 0], [t, e.d - descanso]])} {...trazo} strokeWidth={1.6} />
        <path d={L([[0, e.d - descanso], [e.w, e.d - descanso]])} {...trazo} />
        <path d={L([[t / 2, 0.2], [t / 2, e.d - descanso - 0.2], [t / 2 - 0.25, e.d - descanso - 0.55]])} {...trazo} stroke="#2F6FED" />
      </>
    )
  } else if (e.kind === 'elevador') {
    dentro = (
      <>
        <path data-cruz d={L([[0.15, 0.15], [e.w - 0.15, e.d - 0.15]]) + L([[e.w - 0.15, 0.15], [0.15, e.d - 0.15]])} {...trazo} />
        <path d={L([[e.w * 0.25, 0], [e.w * 0.75, 0]])} {...trazo} stroke="#C2410C" strokeWidth={3} />
      </>
    )
  } else if (e.kind === 'ducto') {
    const rayas: ReactNode[] = []
    for (let s = 0.25, k = 0; s < e.w + e.d; s += 0.25, k++) {
      const a: [number, number] = s <= e.d ? [0, s] : [s - e.d, e.d]
      const b: [number, number] = s <= e.w ? [s, 0] : [e.w, s - e.w]
      rayas.push(<path key={k} data-achurado d={L([a, b])} {...trazo} strokeWidth={0.6} />)
    }
    dentro = <>{rayas}</>
  } else {
    const [cx, cy] = [e.x, e.y]
    dentro = (
      <text x={Number(w(cx, cy).split(',')[0])} y={Number(w(cx, cy).split(',')[1])} fontSize={Math.min(0.45, e.w / 6)} textAnchor="middle" dominantBaseline="middle" fill="#555">
        {NOMBRES.vestibulo}
      </text>
    )
  }
  return (
    <g data-elemento-nucleo={e.kind}>
      <path d={borde} fill={e.kind === 'vestibulo' ? '#ECEAE5' : e.kind === 'ducto' ? '#E2E2E2' : '#FFFFFF'} stroke={MURO} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {dentro}
    </g>
  )
}
