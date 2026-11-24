// @vitest-environment node
// mixed-use-mvp: lo residencial en las exportaciones (el modelo y el .3dm): plantas, núcleos, departamentos con sus
// recámaras, y los sótanos con cajones y rampa.
import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../model/schema.ts'
import { derive } from '../../engine/derive.ts'
import { newProject } from '../../typologies/index.ts'
import { derivar } from '../../modules/residential/engine/derivar.ts'
import { export3dm } from '../export3dm.ts'
import { modelOf } from '../exportModel.ts'
import { planOf } from '../exportPlan.ts'
import { DATA_OBJECT, speckleTreeOf, type SpeckleBase } from '../exportSpeckle.ts'
import { loadRhino3dm } from '../rhino3dm.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
function torre(sotanos: number): Project {
  const p = newProject('mixed-use')
  return {
    ...p, grid: G0,
    masses: [masa('v', 'vivienda', rect(0, 0, 32.4, 16.2), 30), masa('n', 'nucleo', rect(12.15, 5.4, 20.25, 10.8), 30)],
    residential: { ...p.residential!, edificios: { b1: { fondo: 8.1, pasillo: 1.8, mezcla: { studio: 30, br1: 45, br2: 25 }, semilla: 1, sotanos } } },
  }
}

describe('lo residencial en el modelo de exportación', () => {
  it('cada planta a su altura, con sus núcleos y sus departamentos (tipo por nombre, área y recámaras)', () => {
    const p = torre(2)
    const d = derivar(p, 'b1')!
    const m = modelOf(p, derive(p), 'geometry')
    expect(m.residential.length).toBe(1)
    const r = m.residential[0]
    expect(r.buildingId).toBe('b1')
    expect(r.plantas.length).toBe(d.niveles.length)
    r.plantas.forEach((pl, i) => {
      expect(pl.z).toBeCloseTo(d.niveles[i].z, 6)
      expect(pl.contorno.length).toBeGreaterThan(0)
    })
    const unidades = r.plantas.flatMap((pl) => pl.unidades)
    expect(unidades.length).toBe(d.unidades.length)
    const nombres = new Set(p.residential!.tipos.map((t) => t.name))
    for (const u of unidades) {
      expect(nombres.has(u.tipo)).toBe(true)
      expect(u.area).toBeGreaterThan(0)
      expect(u.contorno[0].length).toBeGreaterThanOrEqual(3)
    }
    expect(unidades.some((u) => u.recamaras.length > 0)).toBe(true)
    expect(r.plantas.some((pl) => pl.nucleos.length > 0)).toBe(true)
  })

  it('un sótano por cada uno, bajo la planta más baja, con sus cajones y su rampa', () => {
    const p = torre(2)
    const d = derivar(p, 'b1')!
    const r = modelOf(p, derive(p), 'geometry').residential[0]
    const z0 = Math.min(...d.niveles.map((l) => l.z))
    expect(r.sotanos.map((s) => s.z)).toEqual([z0 - 3.3, z0 - 6.6].map((z) => expect.closeTo(z, 6)))
    for (const s of r.sotanos) {
      expect(s.cajones.length).toBe(d.estacionamiento.porSotano)
      expect(s.rampa).not.toBeNull()
    }
  })

  it('sin sótanos, ninguno; y nada residencial en la exportación del terreno', () => {
    const p = torre(0)
    expect(modelOf(p, derive(p), 'geometry').residential[0].sotanos).toEqual([])
    expect(modelOf(p, derive(p), 'terrain').residential).toEqual([])
  })
})

describe('lo residencial en el .3dm', () => {
  it('capas Residencial::<Edificio>::Plantas, Núcleos, Departamentos, Recámaras, Sótanos::Cajones y Rampa, con User Text', async () => {
    const p = torre(1)
    const rhino = await loadRhino3dm()
    const doc = rhino.File3dm.fromByteArray(await export3dm(p, derive(p)))
    const layers = doc.layers()
    const objs = doc.objects()
    const visto: { path: string; name: string; at: any }[] = []
    for (let i = 0; i < objs.count; i++) {
      const at = objs.get(i).attributes()
      visto.push({ path: layers.get(at.layerIndex).fullPath, name: at.name, at })
    }
    const edificio = p.buildings.find((b) => b.id === 'b1')!.name
    const capas = new Set(visto.map((v) => v.path))
    for (const c of ['Plantas', 'Núcleos', 'Departamentos', 'Recámaras', 'Sótanos::Cajones', 'Sótanos::Rampa']) expect(capas.has(`Residencial::${edificio}::${c}`), c).toBe(true)
    const deptos = visto.filter((v) => v.path === `Residencial::${edificio}::Departamentos`)
    expect(deptos.length).toBe(derivar(p, 'b1')!.unidades.length)
    const u = deptos[0].at
    expect(Number(u.getUserString('gfit.area'))).toBeGreaterThan(0)
    expect(u.getUserString('gfit.tipo')).not.toBe('')
    expect(u.getUserString('gfit.nivel')).not.toBe('')
  })
})

describe('la planta tipo en el DXF', () => {
  it('la planta más baja con departamentos: sus departamentos, recámaras y núcleos, con tipo y área de cada uno', () => {
    const p = torre(0)
    const d = derivar(p, 'b1')!
    const tipo = d.niveles.find((l) => (l.layout?.units.length ?? 0) > 0)!
    const plan = planOf(p, derive(p), { threeD: false })
    const en = (layer: string) => plan.entities.filter((e) => e.layer === layer)
    expect(en('A-FLOR-UNIT').length).toBe(tipo.layout!.units.length)
    expect(en('A-FLOR-ROOM').length).toBe(tipo.layout!.units.reduce((n, u) => n + u.rooms.length, 0))
    expect(en('A-FLOR-CORE').length).toBeGreaterThan(0)
    const rotulos = en('A-FLOR-UNIT-IDEN').map((e: any) => e.text)
    expect(rotulos.length).toBe(2 * tipo.layout!.units.length)
    expect(rotulos.some((t: string) => t.endsWith('m²'))).toBe(true)
    for (const l of ['A-FLOR-UNIT', 'A-FLOR-UNIT-IDEN', 'A-FLOR-ROOM', 'A-FLOR-CORE']) expect(plan.layers[l], l).toBeDefined()
  })

  it('en 3D, a la altura de su piso', () => {
    const p = torre(0)
    const d = derivar(p, 'b1')!
    const tipo = d.niveles.find((l) => (l.layout?.units.length ?? 0) > 0)!
    const plan = planOf(p, derive(p), { threeD: true })
    const u = plan.entities.find((e) => e.layer === 'A-FLOR-UNIT') as any
    expect(u.elevation).toBeCloseTo(tipo.z, 6)
  })

  it('sin residencial, nada de eso', () => {
    const p = newProject('mixed-use')
    const plan = planOf(p, derive(p), { threeD: false })
    expect(plan.entities.filter((e) => e.layer.startsWith('A-FLOR-'))).toEqual([])
  })
})

describe('lo residencial en Speckle', () => {
  const hijo = (c: SpeckleBase, name: string) => (c.elements as SpeckleBase[]).find((e) => e.name === name)!
  it('Residencial › <Edificio> › Departamentos: un DataObject por departamento con tipo, área y nivel; Núcleos y Sótanos', () => {
    const p = torre(1)
    const raiz = speckleTreeOf(modelOf(p, derive(p), 'geometry'))
    const edificio = hijo(hijo(raiz, 'Residencial'), p.buildings.find((b) => b.id === 'b1')!.name)
    const deptos = hijo(edificio, 'Departamentos').elements as SpeckleBase[]
    expect(deptos.length).toBe(derivar(p, 'b1')!.unidades.length)
    const u = deptos[0]
    expect(u.speckle_type).toBe(DATA_OBJECT)
    const props = u.properties as Record<string, unknown>
    expect(props['Tipo']).toBeTruthy()
    expect(props['Área (m²)']).toBeGreaterThan(0)
    expect(props['Nivel']).toBeTruthy()
    expect((u.displayValue as unknown[]).length).toBe(1)
    expect(hijo(edificio, 'Núcleos')).toBeDefined()
    expect(hijo(hijo(edificio, 'Sótanos'), 'Cajones')).toBeDefined()
  })
})
