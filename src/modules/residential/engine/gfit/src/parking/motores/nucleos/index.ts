// Núcleos de circulación vertical (spec circulaciones §7): medidas por tipo, su polígono y los que pasan por un
// nivel. Sin React.
import type { Id, Nivel, Nucleo, Proyecto, Punto, TipoNucleo } from '../../modelo/tipos'

/** Medidas por omisión de cada tipo (largo × ancho, m): provisionales, editables en la tarjeta. */
export const MEDIDAS_NUCLEO: Record<TipoNucleo, { largo: number; ancho: number; nombre: string }> = {
  escalera: { largo: 6, ancho: 3, nombre: 'Escalera' },
  elevador: { largo: 2.5, ancho: 2.5, nombre: 'Elevador' },
  montacargas: { largo: 3.5, ancho: 3, nombre: 'Montacargas' },
  escalera_electrica: { largo: 12, ancho: 1.6, nombre: 'Escalera eléctrica' },
  rampa_peatonal: { largo: 20, ancho: 1.5, nombre: 'Rampa peatonal' },
}

export const TIPOS_NUCLEO = Object.keys(MEDIDAS_NUCLEO) as TipoNucleo[]

/** Recorrido máximo por omisión (m, en línea recta): parámetro, no norma. */
export const RECORRIDO_MAX = 40

/** El rectángulo del núcleo en el plano, girado sobre su centro (antihorario desde el eje x). */
export function poligonoNucleo(n: Pick<Nucleo, 'centro' | 'rotacion' | 'largo' | 'ancho'>): Punto[] {
  const a = (n.rotacion * Math.PI) / 180
  const u = { x: Math.cos(a), y: Math.sin(a) }
  const v = { x: -u.y, y: u.x }
  const hl = n.largo / 2
  const ha = n.ancho / 2
  const q = (s: number, t: number): Punto => ({ x: n.centro.x + u.x * s + v.x * t, y: n.centro.y + u.y * s + v.y * t })
  return [q(-hl, -ha), q(hl, -ha), q(hl, ha), q(-hl, ha)]
}

/** Los núcleos que pasan por el nivel. */
export function nucleosEnNivel(p: Proyecto, nivelId: Id): Nucleo[] {
  return (p.nucleos ?? []).filter((n) => n.niveles.includes(nivelId))
}

/** ¿El núcleo cuenta para el recorrido? Las escaleras, fijas o eléctricas. */
export const esEscalera = (n: Pick<Nucleo, 'tipo'>) => n.tipo === 'escalera' || n.tipo === 'escalera_electrica'

/** Distancia de un punto a un polígono (0 si está dentro). */
export function distanciaAPoligono(q: Punto, poligono: Punto[]): number {
  let dentro = false
  let d = Infinity
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[j]
    const b = poligono[i]
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0
    d = Math.min(d, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)))
  }
  return dentro ? 0 : d
}

/** Para el 3D: la cota de abajo y la altura del prisma; null si no pasa por ningún nivel que exista. */
export function alturaNucleo(p: { niveles: Nivel[] }, n: Nucleo): { z0: number; alto: number } | null {
  const niveles = p.niveles.filter((x) => n.niveles.includes(x.id))
  if (niveles.length === 0) return null
  const z0 = Math.min(...niveles.map((x) => x.cota))
  const z1 = Math.max(...niveles.map((x) => x.cota + x.altura))
  return z1 > z0 ? { z0, alto: z1 - z0 } : null
}
