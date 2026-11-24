// @vitest-environment node
// (rhino3dm loads its WebAssembly the Node way; under jsdom it would try to fetch it like a browser.)
// Adapted from the exportar3dm tests of Plaza-Practiko `importar/__tests__/desde3dm.test.ts`: layers, User Text,
// names, '::' in names; plus GFit's volumes, exact arcs, a layer per building of the option, and the ground (Decision
// "Model export": Geometry, Terrain or All).
import { describe, expect, it } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { derive } from '../../engine/derive.ts'
import { setCornerRadius } from '../../engine/geom/edit.ts'
import { footprintContour } from '../../engine/geom/footprint.ts'
import { massHeight } from '../../engine/levels.ts'
import { addBuilding, addOption } from '../../state/actions/buildings.ts'
import { addMass } from '../../state/actions/masses.ts'
import { drawStreet } from '../../state/actions/streets.ts'
import { demoProject } from '../../state/demo.ts'
import { export3dm } from '../export3dm.ts'
import type { ModelPart } from '../exportModel.ts'
import { setTerrain } from '../../state/actions/site.ts'
import { loadRhino3dm } from '../rhino3dm.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function read(p: Project, option?: string, part: ModelPart = 'geometry') {
  const rhino = await loadRhino3dm()
  const doc = rhino.File3dm.fromByteArray(await export3dm(p, derive(p, option), part))
  const layers = doc.layers()
  const objs = doc.objects()
  const seen: { path: string; name: string; program: string; mass: string; geometry: any }[] = []
  for (let i = 0; i < objs.count; i++) {
    const o = objs.get(i)
    const at = o.attributes()
    seen.push({
      path: layers.get(at.layerIndex).fullPath,
      name: at.name,
      program: at.getUserString('gfit.program'),
      mass: at.getUserString('gfit.mass'),
      geometry: o.geometry(),
    })
  }
  return { rhino, doc, seen }
}

describe('export3dm', () => {
  it('writes GFit::<Building>::<Program> curves and ::Volumes, the site and the buildable line, with User Text and names', async () => {
    const p = demoProject()
    const { doc, seen } = await read(p)
    expect(new Set(seen.map((s) => s.path))).toEqual(
      new Set([
        'GFit::Building 1::Warehouse',
        'GFit::Building 1::Warehouse::Volumes',
        'GFit::Building 1::Office',
        'GFit::Building 1::Office::Volumes',
        'Site',
        'Site::Buildable',
        'Circulation::Streets',
        'Circulation::Streets::Paving',
        'Circulation::Truck courts',
      ]),
    )
    for (const m of p.masses) {
      const mine = seen.filter((s) => s.mass === m.id)
      expect(mine).toHaveLength(2) // the footprint and its volume
      for (const s of mine) {
        expect(s.name).toBe(m.name)
        expect(s.program).toBe(m.programId)
      }
    }
    doc.delete()
  }, 60_000)

  it('a street’s lanes are in its User Text, gfit.lanes, left to right: "3.5,3.5,3.5" (PE.2)', async () => {
    const p = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', [{ x: 0, y: 0 }, { x: 80, y: 0 }], undefined, 10.5)!.project
    p.options[0].streets!.segments[0].lanes = [4, 3.5, 3]
    const { doc } = await read(p)
    const objs = doc.objects()
    const lanes: string[] = []
    for (let i = 0; i < objs.count; i++) lanes.push(objs.get(i).attributes().getUserString('gfit.lanes'))
    // the centre line and its paving carry it; the rest of the plan has none
    expect(lanes.filter((x) => x)).toEqual(['4,3.5,3', '4,3.5,3'])
    doc.delete()
  }, 60_000)

  it('a volume rises from the ground to the mass’s height', async () => {
    const p = demoProject()
    const { doc, seen } = await read(p)
    const m = p.masses[0]
    const v = seen.find((s) => s.mass === m.id && s.path.endsWith('::Volumes'))!
    const box = v.geometry.getBoundingBox()
    expect(box.min[2]).toBeCloseTo(0, 6)
    expect(box.max[2]).toBeCloseTo(massHeight(p, m), 6)
    const c = footprintContour(m.footprint)
    expect(box.max[0] - box.min[0]).toBeCloseTo(Math.max(...c.vertices.map((q) => q.x)) - Math.min(...c.vertices.map((q) => q.x)), 6)
    doc.delete()
  }, 60_000)

  it('a rounded corner is an exact arc (a PolyCurve), not a polyline', async () => {
    const p = demoProject()
    const m = p.masses[0]
    p.masses[0] = { ...m, footprint: { kind: 'contour', contour: setCornerRadius(footprintContour(m.footprint), 1, 10).contour } }
    const { rhino, doc, seen } = await read(p)
    const curve = seen.find((s) => s.mass === m.id && s.path === 'GFit::Building 1::Warehouse')!.geometry
    expect(curve instanceof rhino.PolyCurve).toBe(true)
    expect(curve.isClosed).toBe(true)
    doc.delete()
  }, 60_000)

  it('a "::" in a program name does not break the layer tree; a mass without a program has its own layer', async () => {
    const p = demoProject()
    p.programs = p.programs.map((g) => (g.id === 'warehouse' ? { ...g, name: 'Cold::Storage' } : g))
    p.masses[2] = { ...p.masses[2], programId: null }
    const { doc, seen } = await read(p)
    const paths = seen.map((s) => s.path)
    expect(paths).toContain('GFit::Building 1::Cold-Storage')
    expect(paths).toContain('GFit::Building 1::No program::Volumes')
    doc.delete()
  }, 60_000)

  it('only the option’s buildings go, each in its own layer', async () => {
    // Building 2 (one warehouse) only in Option 2, which also shows Building 1
    const b = addBuilding(demoProject())
    const withMass = addMass(b.project, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 300, y: 220 }, width: 40, depth: 20, rotation: 0 }, levelId: b.levelId })
    const two = addOption(withMass.project, { buildingIds: ['b1', b.id] })
    const first = await read(two.project)
    expect(first.seen.some((s) => s.mass === withMass.id)).toBe(false)
    first.doc.delete()
    const second = await read(two.project, two.id)
    expect(second.seen.filter((s) => s.mass === withMass.id).map((s) => s.path)).toEqual(['GFit::Building 2::Warehouse', 'GFit::Building 2::Warehouse::Volumes'])
    expect(second.seen.filter((s) => s.path.startsWith('GFit::Building 1::'))).toHaveLength(6)
    second.doc.delete()
  }, 60_000)

  it('Terrain: the ground as a mesh (as it is and graded) and its contours, no buildings; All: the masses stand on it', async () => {
    const points = []
    for (let x = -100; x <= 600; x += 50) for (let y = -100; y <= 400; y += 50) points.push({ x, y, z: 480 + 0.02 * x })
    const p = setTerrain(demoProject(), { contours: [{ points: [{ x: -100, y: 0 }, { x: 600, y: 0 }], z: 485 }], points })
    const terrain = await read(p, undefined, 'terrain')
    expect(new Set(terrain.seen.map((s) => s.path))).toEqual(new Set(['Terrain::Existing', 'Terrain::Graded', 'Terrain::Contours']))
    const ground = terrain.seen.find((s) => s.path === 'Terrain::Existing')!.geometry
    expect(ground instanceof terrain.rhino.Mesh).toBe(true)
    expect(ground.getBoundingBox().min[2]).toBeCloseTo(478, 6)
    expect(terrain.seen.find((s) => s.path === 'Terrain::Contours')!.geometry.getBoundingBox().min[2]).toBeCloseTo(485, 6)
    terrain.doc.delete()

    const all = await read(p, undefined, 'all')
    const volume = all.seen.find((s) => s.mass === p.masses[0].id && s.path.endsWith('::Volumes'))!.geometry.getBoundingBox()
    // on its platform, over the ground's 478–490 m
    expect(volume.min[2]).toBeGreaterThan(478)
    expect(volume.min[2]).toBeLessThan(490)
    expect(all.seen.some((s) => s.path === 'Terrain::Existing')).toBe(true)
    all.doc.delete()
  }, 60_000)
})
