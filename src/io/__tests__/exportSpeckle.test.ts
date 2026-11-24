// The Speckle publish's objects (Decision "Speckle publish"): md5 as Node computes it; each mass a DataObject in
// Buildings › building › program with its properties and a closed mesh per floor (its volume its area by its height,
// holes cut); the site's lines and the terrain where Geometry, Terrain and All say; a material per program; serialised
// as Speckle's senders do — every reference resolved, the root's closure all that hangs below it, lists chunked, ids the
// md5 of the JSON, the same project the same ids.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { derive } from '../../engine/derive.ts'
import type { GroundPoint, Point, Project } from '../../model/schema.ts'
import { setTerrain } from '../../state/actions/site.ts'
import { drawStreet } from '../../state/actions/streets.ts'
import { demoProject } from '../../state/demo.ts'
import type { ModelPart } from '../exportModel.ts'
import { argb, COLLECTION, DATA_OBJECT, exportSpeckle, MESH, POLYLINE, prism, serialize, speckleTreeOf, type SpeckleBase } from '../exportSpeckle.ts'
import { modelOf } from '../exportModel.ts'
import { md5 } from '../md5.ts'

const tree = (p: Project, part: ModelPart = 'all') => speckleTreeOf(modelOf(p, derive(p), part), new Map(p.programs.map((g) => [g.id, g.color])))
const elements = (c: SpeckleBase) => c.elements as SpeckleBase[]
const named = (c: SpeckleBase, name: string) => elements(c).find((e) => e.name === name)

/** The volume a closed mesh holds (signed tetrahedra; its n-gons as fans). */
function volume(mesh: SpeckleBase): number {
  const v = mesh.vertices as number[]
  const f = mesh.faces as number[]
  const at = (i: number) => [v[3 * i], v[3 * i + 1], v[3 * i + 2]]
  let sum = 0
  for (let k = 0; k < f.length; k += f[k] + 1) {
    const ids = f.slice(k + 1, k + 1 + f[k])
    for (let t = 1; t + 1 < ids.length; t++) {
      const [a, b, c] = [at(ids[0]), at(ids[t]), at(ids[t + 1])]
      sum += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
  }
  return sum
}

/** The demo on a ground rising east, 1 m in 50. */
function onGround(): Project {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 600; x += 50) for (let y = -100; y <= 400; y += 50) points.push({ x, y, z: 480 + 0.02 * x })
  return setTerrain(demoProject(), { contours: [], points })
}

describe('md5', () => {
  it('as the RFC and Node compute it, multi-byte characters and long strings too', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6')
    for (const s of ['Área útil · 2 400 m² — ñ', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(1000)]) expect(md5(s)).toBe(createHash('md5').update(s, 'utf8').digest('hex'))
  })
})

describe('the Speckle streets (PE.2)', () => {
  it('a street DataObject lists its lanes (m), left to right', () => {
    const p = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', [{ x: 0, y: 0 }, { x: 80, y: 0 }], undefined, 10.5)!.project
    p.options[0].streets!.segments[0].lanes = [4, 3.5, 3]
    const circulation = named(tree(p, 'geometry'), 'Circulation')!
    const streets = named(circulation, 'Streets')!
    const [road] = elements(streets)
    expect((road.properties as Record<string, unknown>)['Lanes (m)']).toEqual([4, 3.5, 3])
  })
})

describe('the Speckle objects', () => {
  it('a prism is closed and holds its area by its height, its holes cut, whichever way its rings run', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const hole: Point[] = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 6 },
      { x: 4, y: 6 },
    ]
    expect(volume(prism(square, [], 5, 3))).toBeCloseTo(300, 6)
    expect(volume(prism([...square].reverse(), [hole], 5, 3))).toBeCloseTo((100 - 4) * 3, 6)
    expect(volume(prism(square, [[...hole].reverse()], 0, 2))).toBeCloseTo(96 * 2, 6)
  })

  it('each mass a DataObject in Buildings › building › program, with its properties and a mesh per floor', () => {
    const p = demoProject()
    p.buildings[0].levels[0] = { ...p.buildings[0].levels[0], repeat: 2 }
    const root = tree(p, 'geometry')
    expect(root.speckle_type).toBe(COLLECTION)
    expect(root.name).toBe(p.name)
    expect(elements(root).map((e) => e.name)).toEqual(['Buildings', 'Site', 'Circulation'])
    const building = named(named(root, 'Buildings')!, 'Building 1')!
    const masses = elements(building).flatMap(elements)
    expect(masses).toHaveLength(p.masses.length)
    const model = modelOf(p, derive(p), 'geometry')
    for (const o of masses) {
      const m = model.masses.find((x) => x.id === o.applicationId)!
      expect(o.speckle_type).toBe(DATA_OBJECT)
      expect(o.name).toBe(m.name)
      expect(o.properties).toMatchObject({ Program: m.program, Building: 'Building 1', Floors: 2, 'gfit.mass': m.id, 'gfit.building': m.buildingId })
      const meshes = o.displayValue as SpeckleBase[]
      expect(meshes.map((x) => x.speckle_type)).toEqual([MESH, MESH])
      for (const mesh of meshes) expect(volume(mesh)).toBeCloseTo(m.area * m.height, 1)
      expect(elements(building).find((c) => elements(c).includes(o))!.name).toBe(m.program)
    }
    const site = named(root, 'Site')!
    expect(elements(site)[0]).toMatchObject({ speckle_type: POLYLINE, closed: true, units: 'm' })
  })

  it('Geometry, Terrain and All take what they say', () => {
    const p = onGround()
    expect(elements(tree(p, 'geometry')).map((e) => e.name)).toEqual(['Buildings', 'Site', 'Circulation'])
    const terrain = tree(p, 'terrain')
    expect(elements(terrain).map((e) => e.name)).toEqual(['Terrain'])
    const ground = elements(named(named(terrain, 'Terrain')!, 'Existing')!)[0]
    expect(ground.speckle_type).toBe(MESH)
    expect((ground.vertices as number[]).length % 3).toBe(0)
    expect(elements(tree(p, 'all')).map((e) => e.name)).toEqual(['Buildings', 'Site', 'Circulation', 'Terrain'])
  })

  it('a material per program, on its masses’ meshes, of its colour', () => {
    const p = demoProject()
    const proxies = tree(p, 'geometry').renderMaterialProxies as { objects: string[]; value: { name: string; diffuse: number } }[]
    const used = new Set(p.masses.map((m) => m.programId).filter(Boolean))
    expect(proxies).toHaveLength(used.size)
    for (const x of proxies) {
      const g = p.programs.find((g) => g.name === x.value.name)!
      expect(x.value.diffuse).toBe(argb(g.color))
      expect(x.objects.length).toBe(p.masses.filter((m) => m.programId === g.id).length)
    }
    expect(argb('#7d8fa8')).toBe((0xff7d8fa8 | 0))
    expect(argb('oklch(0.5 0.1 200)')).toBeNull()
  })
})

describe('serialising for Speckle', () => {
  const parse = (b: ReturnType<typeof serialize>) => new Map(b.objects.map((s) => [JSON.parse(s).id as string, JSON.parse(s) as Record<string, unknown>]))
  const refs = (v: unknown): string[] =>
    Array.isArray(v) ? v.flatMap(refs) : typeof v === 'object' && v !== null ? ((v as { speckle_type?: string }).speckle_type === 'reference' ? [(v as { referencedId: string }).referencedId] : Object.values(v).flatMap(refs)) : []

  it('every reference resolves; the root’s closure is all that hangs below it; ids are the md5 of the JSON', () => {
    const b = exportSpeckle(onGround(), derive(onGround()), 'all')
    const all = parse(b)
    expect(all.has(b.id)).toBe(true)
    for (const o of all.values()) for (const r of refs(o)) expect(all.has(r)).toBe(true)
    const root = all.get(b.id)!
    expect(Object.keys(root.__closure as object).sort()).toEqual([...all.keys()].filter((k) => k !== b.id).sort())
    expect(b.totalChildrenCount).toBe(all.size - 1)
    for (const s of b.objects) {
      const { id, ...rest } = JSON.parse(s)
      expect(md5(JSON.stringify(rest))).toBe(id)
    }
    // the same project, the same objects
    expect(exportSpeckle(onGround(), derive(onGround()), 'all').id).toBe(b.id)
  })

  it('a mesh’s lists are chunked as Speckle declares them; the closure counts how deep each object hangs', () => {
    const mesh: SpeckleBase = { speckle_type: MESH, units: 'm', vertices: Array.from({ length: 70_000 }, (_, i) => i), faces: [3, 0, 1, 2] }
    const b = serialize({ speckle_type: COLLECTION, name: 'Root', elements: [mesh] })
    const all = parse(b)
    const m = [...all.values()].find((o) => o.speckle_type === MESH)!
    expect((m.vertices as unknown[]).length).toBe(3)
    expect((m.faces as unknown[]).length).toBe(1)
    const chunks = (m.vertices as { referencedId: string }[]).map((r) => all.get(r.referencedId)!)
    expect(chunks.map((c) => (c.data as unknown[]).length)).toEqual([31250, 31250, 7500])
    const closure = all.get(b.id)!.__closure as Record<string, number>
    expect(closure[m.id as string]).toBe(1)
    expect(closure[chunks[0].id as string]).toBe(2)
  })
})
