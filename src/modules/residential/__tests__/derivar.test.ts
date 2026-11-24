import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { toGrid, toPlan } from '../../../engine/grid/index.ts'
import { addBuilding } from '../../../state/actions/buildings.ts'
import { newProject } from '../../../typologies/index.ts'
import { area, difference, intersection, toShape } from '../engine/gfit/src/model/geom.ts'
import type { Pt, Shape } from '../engine/gfit/src/model/geom.ts'
import { derivar, type Derivado } from '../engine/derivar.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const contorno = (pts: Point[]) => ({ vertices: pts.map((q) => ({ ...q, r: 0 })) })
let n = 0
const masa = (programId: string, pts: Point[], height: number, levelId = 'l1', holes: Point[][] = []): Mass => ({
  id: 'm' + ++n, name: programId + ' ' + n, levelId, programId, height,
  footprint: { kind: 'contour', contour: contorno(pts) },
  ...(holes.length ? { holes: holes.map(contorno) } : {}),
})

function proyecto(masas: Mass[], grid: Grid = G0): Project {
  const p = newProject('mixed-use')
  return { ...p, grid, masses: masas }
}
const TORRE = rect(0, 0, 32.4, 16.2)
const NUCLEO = rect(12.15, 5.4, 20.25, 10.8)
const caso = (dx = 0, grid: Grid = G0) => {
  const mv = (pts: Point[]) => pts.map((q) => ({ x: q.x + dx, y: q.y }))
  return proyecto([masa('vivienda', mv(TORRE), 30), masa('nucleo', mv(NUCLEO), 30)], grid)
}

/** Los vértices de unidad sobre las orillas de la placa paralelas al eje x de la retícula, en el marco de la retícula. */
function enFachada(d: Derivado, placa: Point[], g: Grid): number[] {
  const out: number[] = []
  const u = { x: Math.cos((g.angle * Math.PI) / 180), y: Math.sin((g.angle * Math.PI) / 180) }
  for (const { unidad } of d.unidades) {
    for (const ring of unidad.shape) {
      for (const [x, y] of ring) {
        for (let i = 0; i < placa.length; i++) {
          const a = placa[i], b = placa[(i + 1) % placa.length]
          const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy)
          if (Math.abs(dx * u.x + dy * u.y) / len < 0.99) continue
          const t = ((x - a.x) * dx + (y - a.y) * dy) / (len * len)
          const off = Math.abs((x - a.x) * dy - (y - a.y) * dx) / len
          if (off > 0.01 || t < -1e-6 || t > 1 + 1e-6) continue
          out.push(toGrid(g, { x, y }).x)
        }
      }
    }
  }
  return out
}
const enModulos = (xs: number[], paso = 2.7, tol = 0.01) => xs.length > 0 && xs.every((x) => Math.abs(x / paso - Math.round(x / paso)) * paso < tol)
const forma = (pts: Point[], holes: Point[][] = []): Shape => difference(toShape([pts.map((q) => [q.x, q.y] as Pt)]), toShape(holes.map((h) => h.map((q) => [q.x, q.y] as Pt))))

describe('derivar', () => {
  it('(a) una torre de 30 m con su núcleo: 10 niveles, unidades con los muros en módulos de 2.7 m', () => {
    const p = caso()
    const t0 = performance.now()
    const d = derivar(p, 'b1')!
    const ms = performance.now() - t0
    if (ms > 30) console.info(`derivar (a): ${ms.toFixed(0)} ms (más de 30 ms)`)
    expect(d.niveles).toHaveLength(10)
    expect(d.totals.units).toBeGreaterThan(0)
    expect(enModulos(enFachada(d, TORRE, G0))).toBe(true)
  })

  it('(b) un podio de Comercio de 9 m da dos niveles de comercio abajo y la vivienda arriba', () => {
    const p0 = newProject('mixed-use')
    const b = p0.buildings[0]
    const p: Project = {
      ...p0, grid: G0,
      buildings: [{ ...b, levels: [...b.levels, { id: 'l2', name: 'L2', elevation: 9, height: 3, repeat: 1 }] }],
      masses: [masa('comercio', TORRE, 9), masa('vivienda', TORRE, 30, 'l2'), masa('nucleo', NUCLEO, 39)],
    }
    const d = derivar(p, 'b1')!
    expect(d.niveles.slice(0, 2).map((l) => l.prog)).toEqual(['ret', 'ret'])
    expect(d.niveles.slice(2).every((l) => l.prog === 'res')).toBe(true)
    expect(d.niveles.length).toBe(12)
  })

  it('(c) sin masa de núcleo avisa que usa un núcleo automático', () => {
    const d = derivar(proyecto([masa('vivienda', TORRE, 30)]), 'b1')!
    expect(d.avisos.some((a) => a.includes('núcleo automático'))).toBe(true)
  })

  it('(d) una masa de 6 × 30 m no da unidades y lo avisa, sin error', () => {
    const d = derivar(proyecto([masa('vivienda', rect(0, 0, 30, 6), 30)]), 'b1')!
    expect(d.totals.units).toBe(0)
    expect(d.avisos.length).toBeGreaterThan(0)
  })

  it('(e) una huella en L con un hueco: unidades solo dentro de la placa menos el hueco; el remanente se avisa', () => {
    const L = [{ x: 0, y: 0 }, { x: 32.4, y: 0 }, { x: 32.4, y: 16.2 }, { x: 16.2, y: 16.2 }, { x: 16.2, y: 32.4 }, { x: 0, y: 32.4 }]
    const hueco = rect(2, 2, 5, 5)
    const d = derivar(proyecto([masa('vivienda', L, 30, 'l1', [hueco]), masa('nucleo', rect(5.4, 18.9, 10.8, 24.3), 30)]), 'b1')!
    expect(d.totals.units).toBeGreaterThan(0)
    const placa = forma(L, [hueco])
    for (const { unidad } of d.unidades) expect(area(difference(unidad.shape, placa))).toBeLessThan(0.01)
    expect(d.avisos.some((a) => a.includes('remanente'))).toBe(true)
  })

  it('(f) con la retícula girada 30°, los muros caen en módulos en el marco de la retícula', () => {
    const g: Grid = { ...G0, origin: { x: 5, y: 3 }, angle: 30 }
    const placa = rect(0, 0, 32.4, 16.2).map((q) => toPlan(g, q))
    const nucleo = NUCLEO.map((q) => toPlan(g, q))
    const d = derivar(proyecto([masa('vivienda', placa, 30), masa('nucleo', nucleo, 30)], g), 'b1')!
    expect(d.totals.units).toBeGreaterThan(0)
    expect(enModulos(enFachada(d, placa, g))).toBe(true)
  })

  it('(g) con dos edificios, cada uno ve solo sus masas', () => {
    const p1 = caso()
    const { project, levelId } = addBuilding(p1, { optionId: 'o1' })
    const b2 = project.buildings.find((b) => b.levels.some((l) => l.id === levelId))!.id
    const p = { ...project, masses: [...project.masses, masa('vivienda', rect(40.5, 0, 72.9, 16.2), 9, levelId)] }
    const d2 = derivar(p, b2)!
    expect(d2.niveles).toHaveLength(3)
    expect(derivar(p, 'b1')!.niveles).toHaveLength(10)
  })

  it('(h) mover la masa un módulo conserva la regla', () => {
    const d = derivar(caso(2.7), 'b1')!
    expect(d.totals.units).toBeGreaterThan(0)
    expect(enModulos(enFachada(d, TORRE.map((q) => ({ x: q.x + 2.7, y: q.y })), G0))).toBe(true)
  })

  it('(i) el mismo proyecto da el mismo objeto (memo)', () => {
    const p = caso()
    expect(derivar(p, 'b1')).toBe(derivar(p, 'b1'))
  })

  it('(j) mover solo la retícula 1 m mueve los muros con ella (la placa no cambió)', () => {
    derivar(caso(), 'b1')
    const g: Grid = { ...G0, origin: { x: 1, y: 0 } }
    const d = derivar(caso(0, g), 'b1')!
    expect(d.totals.units).toBeGreaterThan(0)
    expect(enModulos(enFachada(d, TORRE, g))).toBe(true)
  })

  it('(k) una masa de Vivienda de un solo nivel en el suelo ya da departamentos (sin lobby)', () => {
    const d = derivar(proyecto([masa('vivienda', TORRE, 3), masa('nucleo', NUCLEO, 3)]), 'b1')!
    expect(d.niveles).toHaveLength(1)
    expect(d.niveles[0].lobby).toBeFalsy()
    expect(d.totals.units).toBeGreaterThan(0)
  })

  it('(l) estacionamiento: sótanos bajo la huella con el motor de cajones, los que pide el programa', () => {
    const d = derivar(caso(), 'b1')!
    const e = d.estacionamiento
    expect(e.porSotano).toBeGreaterThan(0)
    expect(e.sotanos).toBe(Math.min(5, Math.ceil(d.totals.req / e.porSotano)))
    expect(e.cajones).toBe(e.sotanos * e.porSotano)
    expect(d.totals.prov).toBe(e.cajones)
    expect(e.plano.cajones.length).toBe(e.porSotano)
    expect(e.costo).toBeGreaterThan(0)
  })

  it('(l2) el sótano lleva una rampa de doble sentido y ningún cajón se le encima', () => {
    const e = derivar(caso(), 'b1')!.estacionamiento
    // la rampa y sus bocas
    expect(e.plano.rampas.length).toBeGreaterThan(0)
    const rampa = toShape(e.plano.rampas)
    expect(area(rampa)).toBeGreaterThan(6 * 10)
    for (const c of e.plano.cajones) expect(area(intersection(toShape([c]), rampa))).toBeLessThan(0.01)
  })

  it('(l2b) la rampa y sus bocas quedan dentro del contorno del sótano', () => {
    const d = derivar(caso(), 'b1')!
    const e = d.estacionamiento
    for (const r of e.plano.rampas) expect(area(difference(toShape([r]), e.plano.contorno))).toBeLessThan(0.01)
    // la torre de 32.4 no da para 22 m de rampa más dos bocas de 6: la rampa va entera y las bocas recortadas, con aviso
    expect(area(toShape([e.plano.rampas[0]]))).toBeCloseTo(6 * 22, 0)
    expect(d.avisos.some((a) => /rampa/i.test(a))).toBe(true)
  })

  it('(l2c) en una barra larga la rampa va centrada con sus dos bocas completas y sin aviso', () => {
    const barra = rect(0, 0, 48.6, 16.2)
    const d = derivar(proyecto([masa('vivienda', barra, 30), masa('nucleo', rect(0, 5.4, 8.1, 10.8), 30)]), 'b1')!
    const e = d.estacionamiento
    for (const r of e.plano.rampas) expect(area(difference(toShape([r]), e.plano.contorno))).toBeLessThan(0.01)
    expect(area(toShape(e.plano.rampas))).toBeCloseTo(6 * (22 + 12), 0)
    expect(d.avisos.some((a) => /rampa/i.test(a))).toBe(false)
  })

  describe('la rampa mira a la calle', () => {
    const conCalle = (p: Project, ...calles: Point[][]): Project => ({
      ...p, site: { ...p.site, existingRoads: calles.map((points, i) => ({ id: 'r' + i, points, stretches: points.slice(1).map(() => ({ left: 4, right: 4 })) })) },
    })
    const SUR = [{ x: -20, y: -10 }, { x: 60, y: -10 }]
    const NORTE = [{ x: -20, y: 26 }, { x: 60, y: 26 }]
    const ys = (d: Derivado) => d.estacionamiento.plano.rampas[0].map((q) => q[1])
    const AVISO = 'Dibuja la calle (Existing road) para orientar la entrada del estacionamiento'

    it('(r1) con la calle al sur, la rampa va en la orilla sur', () => {
      expect(Math.max(...ys(derivar(conCalle(caso(), SUR), 'b1')!))).toBeLessThan(6.01)
    })
    it('(r2) con la calle al norte, en la orilla norte', () => {
      expect(Math.min(...ys(derivar(conCalle(caso(), NORTE), 'b1')!))).toBeGreaterThan(16.2 - 6.01)
    })
    it('(r3) con la calle al oriente, en una orilla larga: la corta no da para la rampa y su boca', () => {
      const r = derivar(conCalle(caso(), [{ x: 45, y: -20 }, { x: 45, y: 40 }]), 'b1')!.estacionamiento.plano.rampas[0]
      const xs = r.map((q) => q[0])
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(22, 0)
    })
    it('(r4) con dos calles, gana la más cercana', () => {
      const d = derivar(conCalle(caso(), [{ x: -20, y: -30 }, { x: 60, y: -30 }], [{ x: -20, y: 20 }, { x: 60, y: 20 }]), 'b1')!
      expect(Math.min(...ys(d))).toBeGreaterThan(16.2 - 6.01)
    })
    it('(r5) dibujar la calle cambia la rampa (la caché no repite la vieja)', () => {
      derivar(caso(), 'b1')
      expect(Math.min(...ys(derivar(conCalle(caso(), NORTE), 'b1')!))).toBeGreaterThan(16.2 - 6.01)
    })
    it('(r7) el plano sabe qué extremo de la rampa sube, y su boca alta está ahí', () => {
      const rp = derivar(caso(), 'b1')!.estacionamiento.plano.rampa!
      expect(rp).toBeTruthy()
      expect([...rp.alto].sort()).toEqual([0, 0, 1, 1])
      const altos = rp.huella.filter((_, i) => rp.alto[i] === 1)
      const bajos = rp.huella.filter((_, i) => rp.alto[i] === 0)
      // los dos altos en un extremo (separados por el ancho, 6 m), los bajos en el otro
      expect(Math.hypot(altos[0][0] - altos[1][0], altos[0][1] - altos[1][1])).toBeCloseTo(6, 1)
      expect(Math.hypot(bajos[0][0] - bajos[1][0], bajos[0][1] - bajos[1][1])).toBeCloseTo(6, 1)
      const toca = (q: Pt) => rp.bocaAlta.some((r) => r.some((b) => Math.hypot(b[0] - q[0], b[1] - q[1]) < 0.01))
      expect(rp.bocaAlta.length).toBeGreaterThan(0)
      expect(altos.every(toca)).toBe(true)
    })
    it('(r6) sin calle, el aviso pide dibujarla; con calle, no', () => {
      expect(derivar(caso(), 'b1')!.avisos).toContain(AVISO)
      expect(derivar(conCalle(caso(), SUR), 'b1')!.avisos).not.toContain(AVISO)
    })
  })

  it('(l3) el sótano trae una flecha de sentido por pasillo', () => {
    const e = derivar(caso(), 'b1')!.estacionamiento
    expect(e.plano.pasillos.length).toBeGreaterThan(0)
    expect(e.plano.flechas.length).toBeGreaterThan(0)
    expect(e.plano.flechas.length).toBeLessThanOrEqual(e.plano.pasillos.length * 2)
  })

  it('(m) los sótanos fijados en el edificio mandan', () => {
    const p = caso()
    const q: Project = { ...p, residential: { ...p.residential!, edificios: { b1: { fondo: 8.1, pasillo: 1.8, mezcla: { studio: 30, br1: 45, br2: 25 }, semilla: 1, sotanos: 1 } } } }
    const d = derivar(q, 'b1')!
    expect(d.estacionamiento.sotanos).toBe(1)
    expect(d.totals.prov).toBe(d.estacionamiento.porSotano)
  })

  it('(n) con la crujía, los muros de fachada caen en columnas al menos tanto como sin columnas', () => {
    // una barra de 48.6 × 16.2 con el núcleo en una punta: tramos con varios departamentos
    const placa = rect(0, 0, 48.6, 16.2)
    const d = derivar(proyecto([masa('vivienda', placa, 30), masa('nucleo', rect(0, 5.4, 8.1, 10.8), 30)]), 'b1')!
    const xs = enFachada(d, placa, G0)
    expect(enModulos(xs)).toBe(true)
    expect(xs.filter((x) => Math.abs(x / 8.1 - Math.round(x / 8.1)) < 1e-3 && x > 8.2 && x < 48.5).length).toBeGreaterThanOrEqual(3)
  })

  it('(o) el terreno del edificio se suma al costo; sin él, 0', () => {
    const p = caso()
    const sin = derivar(p, 'b1')!
    expect(sin.totals.land).toBe(0)
    const q: Project = { ...p, residential: { ...p.residential!, edificios: { b1: { fondo: 8.1, pasillo: 1.8, mezcla: { studio: 30, br1: 45, br2: 25 }, semilla: 1, terreno: 5e6 } } } }
    expect(derivar(q, 'b1')!.totals.cost - sin.totals.cost).toBeCloseTo(5e6, 0)
  })

  it('sin masas de vivienda ni de comercio da null', () => {
    expect(derivar(proyecto([masa('nucleo', NUCLEO, 30)]), 'b1')).toBeNull()
    expect(derivar(newProject('mixed-use'), 'b1')).toBeNull()
  })
})

