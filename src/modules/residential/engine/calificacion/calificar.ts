// Calificación −2…+2 por palancas: cada variable se califica con sus umbrales, la palanca promedia sus variables
// y el puntaje suma calificación × peso. Port de `mixed-use-optimizer/engine/rating.ts`, con la métrica como fórmula.
import { evaluarFormula, type Datos } from './formula.ts'
import { PALANCAS, type Palanca, type Reglas, type Variable } from './reglas.ts'

export type Rating = -2 | -1 | 0 | 1 | 2
export type Traza = { variable: Variable; valor: number | null; rating: Rating | null; porque: string; mediana?: number; rel?: number; err?: boolean }
export type Calificacion = {
  palancas: { palanca: Palanca; rating: Rating | null; peso: number; trazas: Traza[] }[]
  puntaje: number | null
  n: number
  nVars: number
  nTot: number
}

const acotar = (n: number): Rating => Math.max(-2, Math.min(2, n)) as Rating

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** +2…−1 en el primer umbral que se alcanza hacia arriba (un `null` se salta), si no −2 */
function porMayor(x: number, st: (number | null)[]): Rating {
  for (let i = 0; i < 4; i++) if (st[i] != null && x >= st[i]! - 1e-12) return (2 - i) as Rating
  return -2
}
function porMenor(x: number, st: (number | null)[]): Rating {
  for (let i = 0; i < 4; i++) if (st[i] != null && x <= st[i]! + 1e-12) return (2 - i) as Rating
  return -2
}

const esMediana = (m: Variable['mode']) => m === 'vsMedianHigher' || m === 'vsMedianLower'
const pctC = (x: number) =>
  (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.abs(x * 100) % 1 ? Math.abs(x * 100).toFixed(1) : Math.abs(x * 100).toFixed(0)) + '%'
const entero = (n: number) => Math.round(n).toLocaleString('es-MX')

/** Un umbral como se lee: % de la mediana, %, razón o número. */
export function fmtUmbral(v: Variable, s: number): string {
  if (esMediana(v.mode)) return pctC(s)
  if (v.unit === '%') return Math.round(s * 100) + '%'
  if (v.unit === 'ratio') return s.toFixed(2)
  return Math.abs(s) >= 100 ? s.toLocaleString('es-MX') : String(+s.toFixed(2))
}

export function calificar(reglas: Reglas, enUso: Datos, otras: Datos[]): Calificacion {
  const trazas = reglas.variables.map((v): Traza => {
    const r = evaluarFormula(v.formula, enUso)
    if ('err' in r) return { variable: v, valor: null, rating: null, porque: 'fórmula con error: ' + r.err, err: true }
    if (r.v === null) return { variable: v, valor: null, rating: null, porque: 'sin datos: ' + (r.motivo ?? 'falta ' + r.falta.join(', ')) }
    const x = r.v
    if (!esMediana(v.mode)) {
      const rating = v.mode === 'higher' ? porMayor(x, v.steps) : porMenor(x, v.steps)
      const op = v.mode === 'higher' ? '≥' : '≤'
      const porque = rating === -2 ? `no alcanza ${v.steps[3] == null ? '—' : fmtUmbral(v, v.steps[3])}` : `${op} ${fmtUmbral(v, v.steps[2 - rating]!)}`
      return { variable: v, valor: x, rating, porque }
    }
    if (!otras.length) return { variable: v, valor: x, rating: null, porque: 'sin referencia: una sola opción' }
    const vals = [enUso, ...otras].map((d) => evaluarFormula(v.formula, d)).filter((q): q is { v: number } => 'v' in q && q.v !== null).map((q) => q.v)
    if (vals.length < 2) return { variable: v, valor: x, rating: null, porque: 'sin referencia: una sola opción' }
    const med = mediana(vals)
    if (!med) return { variable: v, valor: x, rating: null, porque: 'sin referencia' }
    const rel = x / med - 1
    const rating = v.mode === 'vsMedianHigher' ? porMayor(rel, v.steps) : porMenor(rel, v.steps)
    return { variable: v, valor: x, rating, porque: `${pctC(rel)} vs mediana ${entero(med)}`, mediana: med, rel }
  })

  const palancas = PALANCAS.map((palanca) => {
    const ts = trazas.filter((t) => t.variable.lever === palanca)
    const con = ts.filter((t) => t.rating != null)
    const rating = con.length ? acotar(Math.round(con.reduce((a, t) => a + t.rating!, 0) / con.length) || 0) : null
    return { palanca, rating, peso: reglas.weights[palanca], trazas: ts }
  })
  const cuentan = palancas.filter((p) => p.rating != null && p.peso > 0)
  return {
    palancas,
    puntaje: cuentan.length ? cuentan.reduce((a, p) => a + p.rating! * p.peso, 0) : null,
    n: cuentan.length,
    nVars: trazas.filter((t) => t.rating != null).length,
    nTot: trazas.length,
  }
}
