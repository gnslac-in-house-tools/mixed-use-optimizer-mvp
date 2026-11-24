// A Project as Speckle objects (Decision "Speckle publish"), pure: what exportModel.ts gathers, in the same metres and
// the same place as the .3dm and the IFC, as the tree Speckle's connectors send, then serialised the way its own
// senders do. Nothing here speaks to a server (speckleClient.ts does).
//   <Project>                          the root collection; `renderMaterialProxies` colours each mass by its program
//     Buildings › <Building> › <Program>   each mass a DataObject: its name, its properties (program, building, level,
//                                          area, height, floors, built, and `gfit.mass` / `gfit.program` /
//                                          `gfit.building` as the .3dm's User Text), a closed mesh per floor of a ×N
//                                          level (a thin slab when its program is not built), holes cut
//     Site                             the boundary (arcs as chords) and Buildable, closed polylines at the mean ground
//     Circulation › Streets            each street and existing road (Decision "Streets"): a DataObject, its properties
//                                      (width, vehicles, type, `gfit.road`), its centreline at its graded heights and
//                                      its paving's outline
//     Circulation › Truck courts       each court (Decision "Truck court"): a DataObject, a slab under its level
//     Terrain › Existing · Graded      the ground as a mesh, as it is and graded
//     Terrain › Contours               each contour whose height is known, a polyline at it
// Serialised: each object's id is the md5 of its JSON; a collection's elements, a DataObject's displayValue and a mesh's
// or polyline's lists are detached (the lists in chunks, as Speckle's own classes declare them), each parent keeping a
// `__closure` of what hangs below it and how deep.
import { ShapeUtils, Vector2 } from 'three'
import type { Point, Project } from '../model/schema.ts'
import { contourToPolygon } from '../engine/geom/contour.ts'
import { md5 } from './md5.ts'
import { modelOf, SLAB as SLAB_M, type ExportModel, type ModelMass, type ModelPart } from './exportModel.ts'

/** A Speckle object before it is serialised: its type and whatever it carries. */
export interface SpeckleBase {
  speckle_type: string
  [key: string]: unknown
}

export const COLLECTION = 'Speckle.Core.Models.Collections.Collection'
export const DATA_OBJECT = 'Objects.Data.DataObject'
export const MESH = 'Objects.Geometry.Mesh'
export const POLYLINE = 'Objects.Geometry.Polyline'
const CHUNK = 'Speckle.Core.Models.DataChunk'
const UNITS = 'm'

// what each type detaches, and in chunks of how many (0: detached, not chunked), as Speckle's classes declare
const DETACH: Record<string, Record<string, number>> = {
  [COLLECTION]: { elements: 0 },
  [DATA_OBJECT]: { displayValue: 0 },
  [MESH]: { vertices: 31250, faces: 62500 },
  [POLYLINE]: { value: 31250 },
}

const signedArea = (pts: Point[]) => pts.reduce((a, p, i) => a + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0) / 2
const turned = (pts: Point[], ccw: boolean) => ((signedArea(pts) > 0) === ccw ? pts : [...pts].reverse())

/** A straight prism, from z0 up by height: its caps triangulated around the holes, each side a quad of its own. */
export function prism(polygon: Point[], holes: Point[][], z0: number, height: number): SpeckleBase {
  const outline = turned(polygon, true)
  const hs = holes.filter((h) => h.length >= 3 && signedArea(h) !== 0).map((h) => turned(h, false))
  const ring = [...outline, ...hs.flat()]
  const z1 = z0 + height
  const vertices: number[] = []
  const faces: number[] = []
  for (const z of [z1, z0]) for (const q of ring) vertices.push(q.x, q.y, z)
  const n = ring.length
  const tri = ShapeUtils.triangulateShape(
    outline.map((q) => new Vector2(q.x, q.y)),
    hs.map((h) => h.map((q) => new Vector2(q.x, q.y))),
  )
  for (const [i, j, k] of tri) {
    const [a, b, c] = [ring[i], ring[j], ring[k]]
    const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0
    faces.push(3, ...(ccw ? [i, j, k] : [i, k, j])) // the top faces up
    faces.push(3, ...(ccw ? [i + n, k + n, j + n] : [i + n, j + n, k + n])) // the bottom down
  }
  // a counter-clockwise outline's (or a clockwise hole's) edge a→b faces out
  for (const r of [outline, ...hs]) {
    for (let i = 0; i < r.length; i++) {
      const [a, b] = [r[i], r[(i + 1) % r.length]]
      const at = vertices.length / 3
      vertices.push(a.x, a.y, z0, b.x, b.y, z0, b.x, b.y, z1, a.x, a.y, z1)
      faces.push(4, at, at + 1, at + 2, at + 3)
    }
  }
  return { speckle_type: MESH, units: UNITS, vertices, faces }
}

const polyline = (pts: Point[], z: number, closed: boolean, name: string, properties: Record<string, unknown> = {}): SpeckleBase => ({
  speckle_type: POLYLINE,
  name,
  properties,
  units: UNITS,
  closed,
  value: pts.flatMap((q) => [q.x, q.y, z]),
})

/** A polyline through points each at its own height. */
const polyline3 = (pts: { x: number; y: number; z: number }[], name: string): SpeckleBase => ({
  speckle_type: POLYLINE,
  name,
  units: UNITS,
  closed: false,
  value: pts.flatMap((q) => [q.x, q.y, q.z]),
})

const collection = (name: string, elements: SpeckleBase[]): SpeckleBase => ({ speckle_type: COLLECTION, name, elements })
const some = (name: string, elements: SpeckleBase[]): SpeckleBase[] => (elements.length ? [collection(name, elements)] : [])

/** '#rrggbb' as the signed ARGB integer a RenderMaterial's diffuse is; null for any other colour. */
export function argb(color: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  return m ? (0xff000000 | parseInt(m[1], 16)) | 0 : null
}

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits

function massObject(m: ModelMass, building: string, level: string): SpeckleBase {
  return {
    speckle_type: DATA_OBJECT,
    applicationId: m.id,
    name: m.name,
    properties: {
      Program: m.program,
      Building: building,
      Level: level,
      'Area (m²)': round(m.area),
      'Height (m)': round(m.height, 3),
      Floors: m.floors.length,
      Built: m.built,
      'gfit.mass': m.id,
      'gfit.program': m.programId ?? '',
      'gfit.building': m.buildingId,
    },
    displayValue: m.floors.map((z, k) => ({ ...prism(m.polygon, m.holes, z, m.height), applicationId: `${m.id}:${k}` })),
  }
}

/** The model as the tree of Speckle objects a version holds. */
export function speckleTreeOf(model: ExportModel, colors: ReadonlyMap<string, string> = new Map()): SpeckleBase {
  const levels = new Map(model.buildings.flatMap((b) => b.levels.map((l) => [l.id, l.name] as const)))
  const buildings = model.buildings.flatMap((b) => {
    const own = model.masses.filter((m) => m.buildingId === b.id)
    const programs = [...new Set(own.map((m) => m.program))]
    return some(
      b.name,
      programs.flatMap((g) => some(g, own.filter((m) => m.program === g).map((m) => massObject(m, b.name, levels.get(m.levelId) ?? '')))),
    )
  })

  const site = model.site
    ? some('Site', [
        polyline(contourToPolygon(model.site.boundary), model.site.z, true, 'Site'),
        ...some('Buildable', model.site.buildable.map((r) => polyline(r, model.site!.z, true, 'Buildable'))),
      ])
    : []

  const circulation = some('Circulation', [
    ...some(
      'Streets',
      model.roads.map((r) => ({
        speckle_type: DATA_OBJECT,
        applicationId: r.id,
        name: r.name,
        properties: { 'Width (m)': round(r.width), 'Left (m)': round(r.left), 'Right (m)': round(r.right), 'Lanes (m)': r.lanes.map((x) => round(x, 3)), Vehicles: r.vehicles, ...(r.type ? { 'Street type': r.type } : {}), 'gfit.road': r.id },
        displayValue: [polyline3(r.centre, r.name), ...r.paving.map((o) => polyline(o, r.z, true, `${r.name} paving`))],
      })),
    ),
    ...some(
      'Truck courts',
      model.courts.map((c) => ({
        speckle_type: DATA_OBJECT,
        applicationId: `${c.massId}:court:${c.wall}${c.part ? `:${c.part}` : ''}`,
        name: c.name,
        properties: { 'Depth (m)': round(c.depth), 'Level (m)': round(c.z, 3), 'gfit.mass': c.massId },
        displayValue: [prism(c.outline, [], c.z - SLAB_M, SLAB_M)],
      })),
    ),
  ])
  const ground = (g: ExportModel['grounds'][number]): SpeckleBase => {
    const vertices: number[] = []
    for (let i = 0; i < g.x.length; i++) vertices.push(g.x[i], g.y[i], g.z[i])
    const faces: number[] = []
    for (let k = 0; k < g.triangles.length; k += 3) faces.push(3, g.triangles[k], g.triangles[k + 1], g.triangles[k + 2])
    return { speckle_type: MESH, name: g.name === 'Existing' ? 'Ground' : 'Graded ground', units: UNITS, vertices, faces }
  }
  const terrain = some('Terrain', [
    ...model.grounds.flatMap((g) => some(g.name, [ground(g)])),
    ...some(
      'Contours',
      model.contours.map((c) => polyline(c.points, c.z, c.closed, `Contour ${c.z} m`, { 'gfit.z': c.z })),
    ),
  ])

  // a material per program, on its masses' meshes
  const byProgram = new Map<string, { name: string; ids: string[] }>()
  for (const m of model.masses) {
    if (!m.programId) continue
    const entry = byProgram.get(m.programId) ?? { name: m.program, ids: [] }
    entry.ids.push(...m.floors.map((_, k) => `${m.id}:${k}`))
    byProgram.set(m.programId, entry)
  }
  const renderMaterialProxies = [...byProgram].flatMap(([id, { name, ids }]) => {
    const diffuse = argb(colors.get(id) ?? '')
    return diffuse === null
      ? []
      : [{ speckle_type: 'Objects.Other.RenderMaterialProxy', objects: ids, value: { speckle_type: 'Objects.Other.RenderMaterial', name, diffuse, opacity: 1 } }]
  })

  return {
    ...collection(model.name, [...some('Buildings', buildings), ...site, ...circulation, ...terrain]),
    ...(renderMaterialProxies.length ? { renderMaterialProxies } : {}),
  }
}

/** What a send uploads: every object's JSON (children before parents), the root's id and how many objects hang below it. */
export interface SpeckleBatch {
  id: string
  objects: string[]
  totalChildrenCount: number
}

const isBase = (v: unknown): v is SpeckleBase => typeof v === 'object' && v !== null && typeof (v as SpeckleBase).speckle_type === 'string'

/** The tree as Speckle's senders write it: detached and chunked, each object's id the hash of its JSON. */
export function serialize(root: SpeckleBase, hash: (s: string) => string = md5): SpeckleBatch {
  const objects = new Map<string, string>()

  const write = (o: SpeckleBase): { id: string; closure: Map<string, number> } => {
    const closure = new Map<string, number>()
    const below = (id: string, depth: number) => {
      const d = closure.get(id)
      if (d === undefined || depth < d) closure.set(id, depth)
    }
    const detach = (child: SpeckleBase) => {
      const c = write(child)
      below(c.id, 1)
      for (const [id, depth] of c.closure) below(id, depth + 1)
      return { referencedId: c.id, speckle_type: 'reference' }
    }
    // a value kept inline: its own objects' detached children count as this one's
    const inline = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(inline)
      if (typeof v !== 'object' || v === null) return v
      return Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== undefined && k !== 'id').map(([k, x]) => [k, inline(x)]))
    }

    const out: Record<string, unknown> = { speckle_type: o.speckle_type }
    const rules = DETACH[o.speckle_type] ?? {}
    for (const [key, value] of Object.entries(o)) {
      if (value === undefined || key === 'id' || key === 'speckle_type' || key.startsWith('_')) continue
      if (key in rules && Array.isArray(value)) {
        const size = rules[key]
        if (size > 0) {
          const chunks = []
          for (let k = 0; k < value.length; k += size) chunks.push(detach({ speckle_type: CHUNK, data: value.slice(k, k + size) }))
          out[key] = chunks
        } else out[key] = value.map((x) => (isBase(x) ? detach(x) : inline(x)))
        continue
      }
      out[key] = inline(value)
    }
    if (closure.size) {
      out.totalChildrenCount = closure.size
      out.__closure = Object.fromEntries(closure)
    }
    const id = hash(JSON.stringify(out))
    objects.set(id, JSON.stringify({ id, ...out }))
    return { id, closure }
  }

  const { id, closure } = write(root)
  return { id, objects: [...objects.values()], totalChildrenCount: closure.size }
}

/** The project's asked option, as asked, ready to upload. */
export function exportSpeckle(p: Project, d: Parameters<typeof modelOf>[1], part: ModelPart = 'all'): SpeckleBatch {
  return serialize(speckleTreeOf(modelOf(p, d, part), new Map(p.programs.map((g) => [g.id, g.color]))))
}
