// Rampas ligadas entre niveles (spec circulaciones §6.3). Una rampa que sube (o baja) llega al nivel cuya cota
// es la del suyo más su altura (o al de abajo). En cada masa de cajones de ese nivel que cubre su huella, la app
// deriva una llegada que no se guarda: la huella es un obstáculo (el hueco en la losa) y la boca del extremo
// alto (o bajo) es un acceso. Así la rampa se diseña una vez y su llegada se mueve con ella.
import type { Id, Masa, Nivel, Programa, Proyecto, Punto } from '../../modelo/tipos.ts'
import { puntoEnPerimetro } from '../cajones/index.ts'
import { geometriaDeRampa, medidaDeRampa } from '../cajones/rampas.ts'
import { areaRegiones, interseccion } from '../geom/booleanos.ts'

/** Lo que una rampa de otro nivel deja en una masa de cajones. */
export interface Llegada {
  /** La huella de la rampa recortada a la masa: no lleva cajones. */
  huella: Punto[]
  /** La boca del extremo que llega a este nivel: un acceso a los pasillos. */
  boca: Punto[]
  /** Nombre del nivel de donde viene la rampa. */
  desde: string
  /** La rampa que la produce, como llave de la red (`r:{masaId}:{k}`). */
  llave: string
}

/** Las llegadas por masa que las recibe y las llaves de las rampas que sí llegan a alguna masa de cajones. */
export interface LlegadasProyecto {
  porMasa: Map<Id, Llegada[]>
  conLlegada: Set<string>
}

/** La llave de red de la rampa k de una masa. */
export const llaveRampa = (masaId: Id, k: number) => `r:${masaId}:${k}`

const TOL_COTA = 0.01
const AREA_MIN = 0.5 // m² de huella dentro de la masa para contar como llegada

/** El nivel al que llega una rampa del nivel `n`: el de arriba (cota = cota + altura) o el de abajo. */
export function nivelDestino(niveles: Nivel[], n: Nivel, destino: 'arriba' | 'abajo'): Nivel | null {
  const otro =
    destino === 'arriba'
      ? niveles.find((x) => x.id !== n.id && Math.abs(x.cota - (n.cota + n.altura)) < TOL_COTA)
      : niveles.find((x) => x.id !== n.id && Math.abs(x.cota + x.altura - n.cota) < TOL_COTA)
  return otro ?? null
}

/**
 * El desnivel que salva cada rampa de la masa: la diferencia de cotas con el nivel al que llega (arriba o abajo).
 * Sin nivel de llegada, la altura de la masa. Así el largo, el 3D y la llegada hablan del mismo nivel.
 */
export function desnivelesDe(p: Proyecto, m: Masa): number[] {
  const n = p.niveles.find((x) => x.id === m.nivelId)
  const propia = m.altura ?? n?.altura ?? 0 // sin nivel no se lanza: la huella se calcula fuera del try
  return (m.cajones?.rampas ?? []).map((r) => {
    const otro = n ? nivelDestino(p.niveles, n, r.destino ?? 'arriba') : null
    return otro && n ? Math.abs(otro.cota - n.cota) : propia
  })
}

/** Las llegadas de todas las rampas del proyecto, por masa de cajones que las recibe. */
export function llegadasDelProyecto(
  p: Proyecto,
  planos: { masa: Masa; poligono: Punto[] }[],
  programas: Map<Id, Programa>,
): LlegadasProyecto {
  const deCajones = (m: Masa) => m.programaId !== null && programas.get(m.programaId)?.modo === 'cajones'
  const out = new Map<Id, Llegada[]>()
  const conLlegada = new Set<string>()
  for (const { masa: m, poligono } of planos) {
    if (!m.cajones || m.cajones.rampas.length === 0 || poligono.length < 3 || !deCajones(m)) continue
    const n = p.niveles.find((x) => x.id === m.nivelId)
    if (!n) continue
    const desniveles = desnivelesDe(p, m)
    m.cajones.rampas.forEach((r, k) => {
      const destino = nivelDestino(p.niveles, n, r.destino ?? 'arriba')
      if (!destino) return
      const medida = medidaDeRampa(r, desniveles[k])
      if (!(medida.largo > 0) || !(medida.ancho > 0)) return
      const q = puntoEnPerimetro(poligono, r.t)
      const g = geometriaDeRampa(
        poligono.map((v) => [v.x, v.y]),
        [q.x, q.y],
        medida,
        m.cajones!.anchoPasillo,
      )
      const huella = g.huella.map(([x, y]) => ({ x, y }))
      const boca = g.bocaAlta.map(([x, y]) => ({ x, y }))
      for (const o of planos) {
        if (o.masa.nivelId !== destino.id || o.poligono.length < 3 || !deCajones(o.masa)) continue
        const dentro = interseccion([o.poligono], [huella])
        if (areaRegiones(dentro) < AREA_MIN) continue
        const lista = out.get(o.masa.id) ?? []
        const llave = llaveRampa(m.id, k)
        for (const region of dentro) if (region[0]) lista.push({ huella: region[0], boca, desde: n.nombre, llave })
        out.set(o.masa.id, lista)
        conLlegada.add(llave)
      }
    })
  }
  return { porMasa: out, conLlegada }
}
