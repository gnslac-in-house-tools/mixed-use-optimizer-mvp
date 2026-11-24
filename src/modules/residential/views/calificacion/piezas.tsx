// Las piezas de la calificación que reusan la pestaña, la barra de KPIs y la ventana de reglas: la escala de 5 puntos,
// la barra divergente del puntaje, la barra de 5 bandas de una variable, el valor con signo y el detalle oculto (umbrales,
// porqué, fórmula y fuente). Verde compensa, rojo penaliza, gris neutral (los tokens de estado de GIM).
import type { Calificacion, Rating, Traza } from '../../engine/calificacion/calificar.ts'
import { fmtUmbral } from '../../engine/calificacion/calificar.ts'

/** Las bandas −2…+2 de la barra de una variable (rojo → gris → verde), las de la maqueta aprobada. */
export const BANDAS = ['#efc3be', '#f7e0dd', '#e5e5ea', '#d5ebda', '#b3dbbd']

/** Con signo: +1, −1 (signo menos), 0. */
export const conSigno = (r: number) => (r > 0 ? '+' + r : r < 0 ? '−' + Math.abs(r) : '0')
/** Lo que se lee de una calificación: con signo, o «sin datos». */
export const leer = (r: number | null) => (r == null ? 'sin datos' : conSigno(r))

/** El color del texto de una calificación: verde compensa, rojo penaliza, gris neutral, tenue sin dato. */
export const texto = (r: number | null) => (r == null ? 'text-ink-tertiary' : r > 0 ? 'text-status-within' : r < 0 ? 'text-status-over' : 'text-ink-secondary')
const fondo = (r: number) => (r > 0 ? 'bg-status-within' : r < 0 ? 'bg-status-over' : 'bg-ink-secondary')

/** El valor de una variable con su unidad; «—» sin dato. */
export function fmtValor(t: Traza): string {
  const x = t.valor
  if (x == null || !Number.isFinite(x)) return '—'
  const u = t.variable.unit
  if (u === 'ratio') return x.toFixed(2)
  if (u === '%') return Math.round(x * 100) + ' %'
  if (u === 'niveles') return x + (x === 1 ? ' nivel' : ' niveles')
  return Math.round(x).toLocaleString('es-MX') + (u ? ' ' + u : '')
}

/** La calificación con signo, en su color; «—» sin dato. */
export function Valor({ rating }: { rating: number | null }) {
  return (
    <span className={`text-right text-label font-semibold tabular-nums ${texto(rating)}`} title={rating == null ? 'sin datos' : undefined}>
      {rating == null ? '—' : conSigno(rating)}
    </span>
  )
}

/** La escala de 5 puntos (−2…+2) con el punto de la calificación en su color; tenue sin dato. */
export function Puntos({ rating, className = 'w-[70px]' }: { rating: Rating | null; className?: string }) {
  return (
    <span aria-hidden className={`relative grid h-3.5 grid-cols-5 items-center ${rating == null ? 'opacity-40' : ''} ${className}`}>
      <span className="absolute left-[10%] right-[10%] top-1/2 h-px bg-separator" />
      {([-2, -1, 0, 1, 2] as const).map((v) =>
        v === rating ? (
          <span key={v} data-on="" className={`relative h-[11px] w-[11px] justify-self-center rounded-pill ring-2 ring-[var(--panel)] ${fondo(v)}`} />
        ) : v === 0 ? (
          <span key={v} className="relative h-[9px] w-px justify-self-center bg-ink-tertiary" />
        ) : (
          <span key={v} className="relative h-[5px] w-[5px] justify-self-center rounded-pill bg-fill" />
        ),
      )}
    </span>
  )
}

/** La barra divergente del puntaje: lo que aporta cada palanca (calificación × peso), a la derecha si compensa. */
export function BarraSuma({ calificacion, clase = 'h-2' }: { calificacion: Calificacion; clase?: string }) {
  const max = calificacion.palancas.reduce((a, p) => a + 2 * p.peso, 0) || 1
  let izq = 50
  let der = 50
  const tramos: { left: number; width: number; r: number }[] = []
  for (const p of calificacion.palancas) {
    if (!p.rating || !p.peso) continue
    const w = (Math.abs(p.rating * p.peso) / max) * 50
    if (!Number.isFinite(w)) continue
    if (p.rating > 0) {
      tramos.push({ left: der, width: w, r: p.rating })
      der += w
    } else {
      izq -= w
      tramos.push({ left: izq, width: w, r: p.rating })
    }
  }
  return (
    <span role="img" aria-label="Contribución de cada palanca al puntaje" className={`relative block overflow-hidden rounded-pill bg-fill ${clase}`}>
      {tramos.map((t, i) => (
        <i key={i} className={`absolute inset-y-0 ${fondo(t.r)}`} style={{ left: `${t.left}%`, width: `${t.width}%`, opacity: 0.55 + 0.2 * Math.abs(t.r) }} />
      ))}
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-ink-tertiary" />
    </span>
  )
}

const negativo = (t: Traza) => t.variable.mode === 'lower' || t.variable.mode === 'vsMedianLower'
const deMediana = (t: Traza) => t.variable.mode === 'vsMedianHigher' || t.variable.mode === 'vsMedianLower'

/** Dónde cae la variable en la barra (0…1, bandas −2…+2) y las etiquetas de sus umbrales; null sin calificación. */
export function posicion(t: Traza): { pos: number; ticks: [number, string][] } | null {
  if (t.rating == null) return null
  const s = t.variable.steps
  const orden = [s[3], s[2], s[1], s[0]]
  const ticks = orden.flatMap((v, i): [number, string][] => (v == null ? [] : [[0.2 * (i + 1), fmtUmbral(t.variable, v)]]))
  const enBanda = (t.rating + 2.5) / 5
  const x = deMediana(t) ? t.rel : t.valor
  if (orden.some((b) => b == null) || x == null || !Number.isFinite(x)) return { pos: enBanda, ticks }
  const B = orden.map((b) => (negativo(t) ? -b! : b!))
  const y = negativo(t) ? -x : x
  let pos: number
  if (y < B[0]) pos = 0.2 - Math.min(1, (B[0] - y) / (B[1] - B[0] || 1)) * 0.18
  else if (y >= B[3]) pos = 0.8 + Math.min(1, (y - B[3]) / (B[3] - B[2] || 1)) * 0.18
  else {
    let i = 0
    while (i < 2 && y >= B[i + 1]) i++
    pos = 0.2 * (i + 1) + (0.2 * (y - B[i])) / (B[i + 1] - B[i] || 1)
  }
  return { pos: Number.isFinite(pos) ? Math.max(0, Math.min(1, pos)) : enBanda, ticks }
}

/** La barra de 5 bandas de una variable con el marcador de hoy; nada sin calificación. */
export function BarraBandas({ traza }: { traza: Traza }) {
  const b = posicion(traza)
  if (!b) return null
  return (
    <div className="relative grid h-1.5 grid-cols-5 gap-px" aria-hidden>
      {BANDAS.map((c, i) => (
        <b key={c} className={`block h-1.5 ${i === 0 ? 'rounded-l-pill' : i === 4 ? 'rounded-r-pill' : ''}`} style={{ background: c }} />
      ))}
      <span className="absolute -top-[3px] -ml-[1.5px] h-3 w-[3px] rounded-pill bg-ink ring-[1.5px] ring-[var(--panel)]" style={{ left: `${(b.pos * 100).toFixed(1)}%` }} />
    </div>
  )
}

/** Lo que va oculto de una variable (GIM, Decision «Help»): los umbrales bajo la barra, el porqué, la fórmula y la fuente. */
export function DetalleVariable({ traza }: { traza: Traza }) {
  const b = posicion(traza)
  return (
    <div className="flex flex-col">
      {b && (
        <div aria-hidden className="relative h-[15px] text-[10px] tabular-nums text-ink-tertiary">
          {b.ticks.map(([x, s]) => (
            <span key={x} className="absolute top-[3px] -translate-x-1/2 whitespace-nowrap" style={{ left: `${x * 100}%` }}>
              {s}
            </span>
          ))}
        </div>
      )}
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-caption">
        <dt className="text-ink-tertiary">Por qué</dt>
        <dd className="text-ink-secondary">{traza.porque}</dd>
        <dt className="text-ink-tertiary">Fórmula</dt>
        <dd>
          <code className="rounded-control bg-fill px-1 text-[10.5px] text-ink">{traza.variable.formula}</code>
        </dd>
        <dt className="text-ink-tertiary">Fuente</dt>
        <dd className="text-ink-secondary">{traza.variable.legalRef}</dd>
      </dl>
    </div>
  )
}
