// Un departamento en la vista de documentación (engine/documentacion.ts), en el mundo de PlanSvg (x, −y): recintos de
// color por uso con su nombre y su área, el poché de los muros, las puertas con su abatimiento, las ventanas y, si se
// piden, los muebles en línea fina. El dibujo va en el marco del plano (`marco`), los rótulos derechos en el mundo.
import type { PlanCatalogo } from '../engine/catalogo.ts'
import { dibujoDoc, type Doc } from '../engine/documentacion.ts'
import type { Pt } from '../engine/gfit/src/model/geom.ts'
import { MuebleSvg } from './PlanMini.tsx'

/** Los colores de la lámina por uso del recinto (como Finch: recámaras verdes, estar morado, baños azules…). */
export const DOC_FILL: Record<string, string> = {
  living: '#CDB3EA', dining: '#CDB3EA', kitchen: '#EFAAAA', bed: '#AEDBA9', master: '#AEDBA9', study: '#AEDBA9',
  bath: '#AFCFF0', halfbath: '#AFCFF0', laundry: '#E8E2A6', storage: '#E8E2A6', hall: '#D3D3D3', terrace: '#CFCFCF',
}
const POCHE = '#1F1F1F'

const cache = new WeakMap<PlanCatalogo, Doc>()
const docDe = (p: PlanCatalogo) => cache.get(p) ?? (cache.set(p, dibujoDoc(p)), cache.get(p)!)

interface Marco { o: Pt; u: Pt; v: Pt }

export function DocumentacionDepto({ plan, marco, recintos, muebles }: { plan: PlanCatalogo; marco: Marco; recintos: { kind: string; name: string }[]; muebles: boolean }) {
  const d = docDe(plan)
  const { o, u, v } = marco
  const mundo = (x: number, y: number): [number, number] => [o[0] + u[0] * x + v[0] * y, -(o[1] + u[1] * x + v[1] * y)]
  const anillo = (r: [number, number][]) => 'M' + r.map(([x, y]) => `${x},${y}`).join('L') + 'Z'
  const trazo = { fill: 'none', stroke: POCHE, vectorEffect: 'non-scaling-stroke' as const }
  return (
    <g data-documentacion>
      <g transform={`matrix(${u[0]} ${-u[1]} ${v[0]} ${-v[1]} ${o[0]} ${-o[1]})`}>
        {plan.rooms.map((r, k) => <path key={'r' + k} data-recinto-doc d={anillo(r.shape)} fill={DOC_FILL[r.kind] ?? '#E4E4E4'} stroke="#FFFFFF" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)}
        {muebles && <g className="plano-unidad doc-muebles" opacity={0.75}>{plan.muebles.map((f) => <MuebleSvg key={f.id} m={f} />)}</g>}
        {d.ventanas.map((lineas, k) => (
          <g key={'v' + k} data-ventana-doc>
            {lineas.map(([a, b], j) => <path key={j} d={`M${a[0]},${a[1]}L${b[0]},${b[1]}`} {...trazo} strokeWidth={j === 1 ? 0.6 : 1} />)}
          </g>
        ))}
        <path data-poche d={d.muros.map(anillo).join('')} fill={POCHE} stroke="none" />
        {d.puertas.map((q, k) => {
          const r = Math.hypot(q.abierta[0] - q.bisagra[0], q.abierta[1] - q.bisagra[1])
          return (
            <g key={'p' + k} data-puerta-doc>
              <path d={`M${q.bisagra[0]},${q.bisagra[1]}L${q.abierta[0]},${q.abierta[1]}`} {...trazo} strokeWidth={1.4} />
              <path d={`M${q.cerrada[0]},${q.cerrada[1]}A${r},${r} 0 0 ${q.giro} ${q.abierta[0]},${q.abierta[1]}`} {...trazo} strokeWidth={0.6} />
            </g>
          )
        })}
      </g>
      {d.rotulos.map((t, k) => {
        const [x, y] = mundo(t.x, t.y)
        const nombre = (recintos[k]?.name ?? t.nombre).toUpperCase()
        // el ancho del recinto en la lámina (horizontal en el mundo): el rótulo cabe en él
        const xs = plan.rooms[k].shape.map(([a, b]) => mundo(a, b)[0])
        const ancho = Math.max(...xs) - Math.min(...xs)
        const fs = Math.min(0.34, (1.55 * ancho) / Math.max(6, nombre.length))
        if (fs < 0.1) return null
        return (
          <g key={'t' + k} data-rotulo-doc fontFamily="Inter, sans-serif" textAnchor="middle" fill="#2A2A2A" stroke="#FFFFFF" strokeWidth={fs * 0.18} paintOrder="stroke">
            <text x={x} y={y - fs * 0.15} fontSize={fs} fontWeight={600} letterSpacing={0.02}>{nombre}</text>
            <text x={x} y={y + fs * 1.15} fontSize={fs * 0.88}>{t.area.toFixed(1)} m²</text>
          </g>
        )
      })}
    </g>
  )
}
