// Un plano dibujado en chico (mixed-use-optimizer `ui/Catalogo.tsx#PlanMini` y `ui/Furniture.tsx`): recintos en su
// color, muebles como bloques grises con una línea o dos que dicen qué son, y la fachada abajo.
import type { Mueble, PlanCatalogo, Ring } from '../engine/catalogo.ts'
import { CATALOGO, ROOM_FILL } from '../engine/catalogo.ts'

const ringD = (r: Ring) => r.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('') + 'Z'

export function MuebleSvg({ m }: { m: Mueble }) {
  const c = CATALOGO[m.kind] ?? { name: m.kind, w: 0.5, d: 0.5 }
  const w = c.w, d = c.d, hw = w / 2, hd = d / 2
  let detail: React.ReactNode = null
  if (m.kind.startsWith('cama')) {
    const two = w >= 1.3
    detail = <>
      {(two ? [-w / 4, w / 4] : [0]).map((x, i) => <rect key={i} x={x - (two ? w / 4 - 0.08 : hw - 0.12)} y={hd - 0.42} width={two ? w / 2 - 0.16 : w - 0.24} height={0.3} rx={0.06} className="md" />)}
      <line x1={-hw} y1={hd - 0.62} x2={hw} y2={hd - 0.62} className="md" />
    </>
  } else if (m.kind === 'sofa' || m.kind === 'sillon') {
    detail = <><rect x={-hw} y={hd - 0.22} width={w} height={0.22} className="md" /><rect x={-hw} y={-hd} width={0.18} height={d - 0.22} className="md" /><rect x={hw - 0.18} y={-hd} width={0.18} height={d - 0.22} className="md" /></>
  } else if (m.kind === 'cocina') {
    detail = <>{[[-hw + 0.3, 0.1], [-hw + 0.6, 0.1], [-hw + 0.3, -0.12], [-hw + 0.6, -0.12]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.08} className="md" />)}<rect x={0.1} y={-0.18} width={0.5} height={0.36} rx={0.05} className="md" /></>
  } else if (m.kind === 'refri' || m.kind === 'closet') {
    detail = <><line x1={-hw} y1={-hd} x2={hw} y2={hd} className="md" /><line x1={-hw} y1={hd} x2={hw} y2={-hd} className="md" /></>
  } else if (m.kind === 'wc') {
    detail = <><rect x={-hw} y={hd - 0.18} width={w} height={0.18} className="md" /><ellipse cx={0} cy={-0.08} rx={0.17} ry={0.24} className="md" /></>
  } else if (m.kind === 'lavabo') {
    detail = <ellipse cx={0} cy={-0.02} rx={0.18} ry={0.13} className="md" />
  } else if (m.kind === 'regadera') {
    detail = <><line x1={-hw} y1={-hd} x2={hw} y2={hd} className="md" /><circle cx={0} cy={0} r={0.05} className="md" /></>
  } else if (m.kind === 'lavadora') {
    detail = <circle cx={0} cy={0} r={0.2} className="md" />
  } else if (m.kind === 'estante') {
    detail = <line x1={-hw} y1={0} x2={hw} y2={0} className="md" />
  }
  return (
    <g transform={`translate(${m.x},${m.y}) rotate(${m.rot})`}>
      <title>{c.name}</title>
      <rect x={-hw} y={-hd} width={w} height={d} rx={m.kind.startsWith('comedor') || m.kind.startsWith('mesa') ? 0.05 : 0.02} className="mueble" />
      {detail}
    </g>
  )
}

/** El plano grande de la vista Planta: recintos con nombre y área, muebles, cotas de ancho y fondo, y la fachada. */
export function PlanoUnidad({ p, muebles = true }: { p: PlanCatalogo; muebles?: boolean }) {
  const pad = 1.4
  const centro = (r: Ring) => {
    const xs = r.map((q) => q[0]), ys = r.map((q) => q[1])
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(...xs) - Math.min(...xs)]
  }
  const area = (r: Ring) => Math.abs(r.reduce((s, q, i) => { const n = r[(i + 1) % r.length]; return s + q[0] * n[1] - n[0] * q[1] }, 0) / 2)
  return (
    <svg className="plano-unidad h-full max-h-full w-full max-w-full" viewBox={`${-pad} ${-(p.d + pad)} ${p.w + 2 * pad} ${p.d + 2 * pad}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Planta de ${p.name}`}>
      <g transform="scale(1,-1)">
        <rect x={0} y={0} width={p.w} height={p.d} className="pm-outline" />
        {p.rooms.map((r, k) => <path key={k} d={ringD(r.shape)} fill={ROOM_FILL[r.kind] ?? '#eee'} className="pm-room" />)}
        {muebles && p.muebles.map((f) => <MuebleSvg key={f.id} m={f} />)}
        <line x1={0} y1={0} x2={p.w} y2={0} className="pm-facade" />
      </g>
      {p.rooms.map((r, k) => {
        const [x, y, w] = centro(r.shape)
        const fs = Math.min(0.32, w / 9)
        return (
          <g key={'t' + k} className="pu-rotulo">
            <text x={x} y={-y - fs * 0.2} fontSize={fs} textAnchor="middle">{r.name}</text>
            <text x={x} y={-y + fs * 1.1} fontSize={fs * 0.85} textAnchor="middle" className="pu-area">{area(r.shape).toFixed(1)} m²</text>
          </g>
        )
      })}
      <g className="pu-cota">
        <line x1={0} y1={0.7} x2={p.w} y2={0.7} /><text x={p.w / 2} y={1.15} fontSize={0.3} textAnchor="middle">{p.w.toFixed(2)} m · fachada</text>
        <line x1={-0.7} y1={0} x2={-0.7} y2={-p.d} /><text x={-0.95} y={-p.d / 2} fontSize={0.3} textAnchor="middle" transform={`rotate(-90 ${-0.95} ${-p.d / 2})`}>{p.d.toFixed(2)} m</text>
      </g>
    </svg>
  )
}

export function PlanMini({ p, h = 76, muebles = true }: { p: PlanCatalogo; h?: number; muebles?: boolean }) {
  const pad = 0.3
  return (
    <svg className="plan-mini" viewBox={`${-pad} ${-(p.d + pad)} ${p.w + 2 * pad} ${p.d + 2 * pad}`} style={{ height: h }} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g transform="scale(1,-1)">
        <rect x={0} y={0} width={p.w} height={p.d} className="pm-outline" />
        {p.rooms.map((r, k) => <path key={k} d={ringD(r.shape)} fill={ROOM_FILL[r.kind] ?? '#eee'} className="pm-room" />)}
        {muebles && p.muebles.map((f) => <MuebleSvg key={f.id} m={f} />)}
        <line x1={0} y1={0} x2={p.w} y2={0} className="pm-facade" />
      </g>
    </svg>
  )
}
