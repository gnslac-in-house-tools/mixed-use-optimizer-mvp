import { describe, expect, it } from 'vitest'
import type { PlanCatalogo } from '../engine/catalogo.ts'
import { agregarPuerta } from '../engine/editor.ts'
import { area, toShape, union } from '../engine/gfit/src/model/geom.ts'
import type { PlacedUnit } from '../engine/gfit/src/layout/level.ts'
import { estirar, interiorUnidad, marcoDeUnidad } from '../engine/pieza4.ts'

const r = (x0: number, x1: number) => [[x0, 0], [x1, 0], [x1, 8.1], [x0, 8.1]] as [number, number][]
const tres = (fijas: number[] = []): PlanCatalogo => ({
  id: 'C1', name: 'Mío', origen: 'manual', typeId: 'br1', w: 8.1, d: 8.1,
  rooms: [{ kind: 'living', name: 'Estar', shape: r(0, 3) }, { kind: 'bath', name: 'Baño', shape: r(3, 5.4) }, { kind: 'bed', name: 'Dormitorio', shape: r(5.4, 8.1) }],
  muebles: [], reglas: { cama: 'queen', comedor: 4, paso: 0.75, closets: true }, fijas: { x: fijas, y: [] },
})
const xs = (p: PlanCatalogo) => p.rooms.map((q) => [Math.min(...q.shape.map((v) => v[0])), Math.max(...q.shape.map((v) => v[0]))])

describe('pieza 4: el plano de Mi biblioteca en los departamentos de la planta', () => {
  it('estirar: sin cotas fijas, todo crece en proporción', () => {
    const p = estirar(tres(), 10.8, 8.1)
    expect(p.w).toBe(10.8)
    expect(xs(p)).toEqual([[0, 4], [4, 7.2], [7.2, 10.8]])
  })

  it('estirar: una cota fija conserva su medida y las movibles reparten la diferencia', () => {
    const p = estirar(tres([1]), 10.8, 8.1) // el baño (2.4) fijo
    const [, b] = xs(p)
    expect(b[1] - b[0]).toBeCloseTo(2.4, 6)
    expect(xs(p)[2][1]).toBeCloseTo(10.8, 6)
  })

  it('estirar mueve las puertas con sus muros', () => {
    const p = estirar(agregarPuerta(tres(), { x: 3, y: 4 }), 10.8, 8.1)
    expect(p.puertas![0].x).toBeCloseTo(4, 6)
  })

  it('el marco de un departamento: la fachada es el lado opuesto a su entrada', () => {
    const u = { shape: toShape([[[10, 0], [20, 0], [20, 8], [10, 8]]]), entry: [15, 8] } as unknown as PlacedUnit
    const m = marcoDeUnidad(u)!
    expect(m.w).toBeCloseTo(10, 6)
    expect(m.d).toBeCloseTo(8, 6)
    // y del plano va de la fachada (y = 0 del mundo) hacia la entrada
    expect(m.v[1]).toBeCloseTo(1, 6)
  })

  it('interiorUnidad usa el plano de Mi biblioteca de su tipo, estirado al departamento; sin él, null', () => {
    const u = { type: 'br1', shape: toShape([[[10, 0], [20.8, 0], [20.8, 8.1], [10, 8.1]]]), entry: [15, 8.1], rooms: [] } as unknown as PlacedUnit
    expect(interiorUnidad(u, [])).toBeNull()
    expect(interiorUnidad(u, [{ ...tres(), typeId: 'br2' }])).toBeNull()
    const it = interiorUnidad(u, [tres()])!
    expect(it.plan.id).toBe('C1')
    expect(it.recintos).toHaveLength(3)
    expect(area(union(it.recintos.map((q) => q.shape)))).toBeCloseTo(10.8 * 8.1, 3)
    expect(it.recintos.map((q) => q.name)).toEqual(['Estar', 'Baño', 'Dormitorio'])
  })
})

describe('pieza 4: el interior de GFit amueblado', () => {
  it('interiorDe: sin plano propio, el de GFit en el marco del departamento, con muebles', async () => {
    const { derivar } = await import('../engine/derivar.ts')
    const { newProject } = await import('../../../typologies/index.ts')
    const { interiorDe } = await import('../engine/pieza4.ts')
    const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
    const m = (id: string, pr: string, pts: { x: number; y: number }[]) => ({ id, name: id, levelId: 'l1', programId: pr, height: 30, footprint: { kind: 'contour' as const, contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } } })
    const p = { ...newProject('mixed-use'), grid: { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }, masses: [m('a', 'vivienda', rect(0, 0, 48.6, 16.2)), m('b', 'nucleo', rect(0, 5.4, 8.1, 10.8))] }
    const u = derivar(p, 'b1')!.niveles[3].layout!.units[0]
    const it = interiorDe(u, [])!
    expect(it.fuente).toBe('gfit')
    expect(it.plan.rooms).toHaveLength(u.rooms.length)
    expect(it.plan.muebles.length).toBeGreaterThan(0)
    // los recintos locales caben en el marco del departamento
    for (const r of it.plan.rooms) for (const [x, y] of r.shape) { expect(x).toBeGreaterThan(-0.05); expect(x).toBeLessThan(it.marco.w + 0.05); expect(y).toBeGreaterThan(-0.05); expect(y).toBeLessThan(it.marco.d + 0.05) }
  })
})
