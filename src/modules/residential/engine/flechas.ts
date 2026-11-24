// Una flecha de sentido por pasillo del sótano (mixed-use-optimizer `ui/Svg.tsx#arrowsPerAisle`, G13): de las que el
// motor de cajones pone cada 9 m, la más cercana al centro de su pasillo, para que el sentido se lea como señal y no
// como textura. Una flecha en un cruce es del pasillo que recorre; una fuera de todo pasillo se queda. Puro.
import type { Ring } from './gfit/src/host/protocol.ts'

const centro = (r: Ring): [number, number] => {
  let x = 0, y = 0
  for (const p of r) { x += p[0]; y += p[1] }
  return [x / r.length, y / r.length]
}
function dentro(p: [number, number], r: Ring): boolean {
  let s = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) s = !s
  }
  return s
}
function rumbo(r: Ring): number {
  let best = 0, ang = 0
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > best) { best = l; ang = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 180 }
  }
  return ang
}
const difAng = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d) }

export function flechasPorPasillo(pasillos: Ring[], flechas: Ring[]): Ring[] {
  const sueltas: Ring[] = []
  const rumbos = pasillos.map(rumbo)
  const grupos = new Map<string, { a: Ring; t: number }[]>()
  for (const a of flechas) {
    const c = centro(a)
    const dir = ((Math.atan2(a[0][1] - c[1], a[0][0] - c[0]) * 180) / Math.PI + 360) % 180
    const ks = pasillos.map((_, k) => k).filter((k) => dentro(c, pasillos[k]))
    if (!ks.length) { sueltas.push(a); continue }
    const k = ks.sort((x, y) => difAng(rumbos[x], dir) - difAng(rumbos[y], dir))[0]
    const clave = k + ':' + (Math.round(dir / 15) % 12)
    const rad = (dir * Math.PI) / 180, ax = pasillos[k].map((p) => p[0]), ay = pasillos[k].map((p) => p[1])
    const m = [(Math.min(...ax) + Math.max(...ax)) / 2, (Math.min(...ay) + Math.max(...ay)) / 2]
    grupos.set(clave, [...(grupos.get(clave) ?? []), { a, t: (c[0] - m[0]) * Math.cos(rad) + (c[1] - m[1]) * Math.sin(rad) }])
  }
  return [...[...grupos.values()].map((g) => g.reduce((b, x) => (Math.abs(x.t) < Math.abs(b.t) - 1e-6 ? x : b)).a), ...sueltas]
}
