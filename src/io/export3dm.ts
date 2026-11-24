// A Project as a .3dm file for Rhino. Port of Plaza-Practiko `importar/exportar3dm.ts`, on our types, plus the
// volumes, since a mass here has a height, and the ground (Decision "Model export": Geometry, Terrain or All, what
// exportModel.ts gathers and where it stands). Only the asked option's buildings (Decision "Buildings layout"), one
// layer per building:
//   GFit::<Building>::<Program>            each mass's footprint as a closed curve at its floor's z; rounded corners
//                                          and arc edges are exact arcs. User Text `gfit.program` (program id, empty
//                                          if none), `gfit.mass` (its id) and `gfit.building`, a smart block's
//                                          `gfit.zones` (its zones of other programs, "office:619.5;…" m²); the
//                                          object's name is the mass's name. (An importer, 10.0, reads these back.)
//   GFit::<Building>::<Program>::Volumes   the same footprint extruded by the mass's height, once per floor of a ×N
//                                          level, capped (a thin slab when its program is not built), same User Text
//   Site                       the site boundary (at the site's mean ground while it has one)
//   Site::Buildable            the boundary minus the setback
//   Circulation::Streets       each street and existing road's centreline (Decision "Streets"), at its graded heights on
//                              a terrain; User Text `gfit.road`, `gfit.width`, `gfit.left`, `gfit.right`, `gfit.lanes` ("3.5,3.5,3.5", left to right), `gfit.vehicles`, `gfit.type`
//   Circulation::Streets::Paving  its paving's outline in plan, at the site's mean ground
//   Circulation::Truck courts  each docked wall's court (Decision "Truck court"; a court with a shape of its own: each of them) at its level;
//                              User Text `gfit.court` (its mass and wall, `m1:0`), `gfit.part` (which of the wall's, with shapes), `gfit.depth`
//   Terrain::Existing          the ground as it is, a mesh
//   Terrain::Graded            the ground graded under the platforms, while they grade it
//   Terrain::Contours          each contour whose height is known, at it
// Coordinates are written as they are, in metres, without moving them.
import type { Contour, Point, Project } from '../model/schema.ts'
import { uuid } from '../model/uuid.ts'
import { contourSegments } from '../engine/geom/segments.ts'
import { lanesText, modelOf, type ModelPart } from './exportModel.ts'
import { loadRhino3dm } from './rhino3dm.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */

function contourCurve(rhino: any, c: Contour, z: number): any {
  const segs = contourSegments(c)
  const p3 = (p: Point) => [p.x, p.y, z]
  if (segs.every((s) => !('m' in s))) {
    const pts = segs.map((s) => p3(s.a))
    pts.push(p3(segs[0].a))
    return new rhino.PolylineCurve(pts)
  }
  const pc = new rhino.PolyCurve()
  for (const s of segs) {
    if ('m' in s) pc.appendArc(rhino.Arc.createFromPoints(p3(s.a), p3(s.m), p3(s.b)))
    else pc.appendLine(new rhino.Line(p3(s.a), p3(s.b)))
  }
  return pc
}

/** '::' separates layer levels in Rhino; it cannot be inside a name. */
const clean = (name: string) => name.replace(/:{2,}/g, '-').trim() || '-'

export async function export3dm(p: Project, d: Parameters<typeof modelOf>[1], part: ModelPart = 'geometry'): Promise<Uint8Array> {
  const model = modelOf(p, d, part)
  const rhino = await loadRhino3dm()
  const doc = new rhino.File3dm()
  try {
    try {
      doc.settings().modelUnitSystem = rhino.UnitSystem.Meters
    } catch {
      // the unit is only a convenience when the file opens in Rhino
    }

    const layers = doc.layers()
    const indices = new Map<string, number>()
    const ids = new Map<string, string>()
    const layer = (path: string[]): number => {
      let full = ''
      let idx = -1
      for (const name of path.map(clean)) {
        const parent = full
        full = parent ? `${parent}::${name}` : name
        if (!indices.has(full)) {
          const l = new rhino.Layer()
          l.name = name
          l.id = uuid()
          if (parent) l.parentLayerId = ids.get(parent)!
          ids.set(full, l.id)
          indices.set(full, layers.add(l))
          l.delete?.()
        }
        idx = indices.get(full)!
      }
      return idx
    }
    const add = (geometry: any, path: string[], name: string, text: Record<string, string>) => {
      const at = new rhino.ObjectAttributes()
      try {
        at.layerIndex = layer(path)
        at.name = name
        for (const [k, v] of Object.entries(text)) at.setUserString(k, v)
        doc.objects().add(geometry, at)
      } finally {
        at.delete?.()
        geometry.delete?.()
      }
    }
    const line = (pts: Point[], z: number, closed: boolean) => new rhino.PolylineCurve([...pts, ...(closed ? [pts[0]] : [])].map((v) => [v.x, v.y, z]))

    const names = new Map(model.buildings.map((b) => [b.id, b.name]))
    for (const m of model.masses) {
      const path = ['GFit', names.get(m.buildingId) ?? '-', m.program]
      const text: Record<string, string> = { 'gfit.program': m.programId ?? '', 'gfit.mass': m.id, 'gfit.building': m.buildingId }
      if (m.zones.length) text['gfit.zones'] = m.zones.map((z) => `${z.programId ?? ''}:${Math.round(z.area * 10) / 10}`).join(';')
      add(contourCurve(rhino, m.contour, m.floors[0]), path, m.name, text)
      for (const z of m.floors) {
        const curve = contourCurve(rhino, m.contour, z)
        try {
          const volume = rhino.Extrusion.create(curve, m.height, true)
          if (volume) add(volume, [...path, 'Volumes'], m.name, text)
        } finally {
          curve.delete?.()
        }
      }
    }

    if (model.site) {
      add(contourCurve(rhino, model.site.boundary, model.site.z), ['Site'], 'Site', {})
      for (const r of model.site.buildable) add(line(r, model.site.z, true), ['Site', 'Buildable'], 'Buildable', {})
    }

    for (const r of model.roads) {
      const text = { 'gfit.road': r.id, 'gfit.width': String(r.width), 'gfit.left': String(r.left), 'gfit.right': String(r.right), 'gfit.lanes': lanesText(r.lanes, ','), 'gfit.vehicles': r.vehicles, ...(r.type ? { 'gfit.type': r.type } : {}) }
      add(new rhino.PolylineCurve(r.centre.map((q) => [q.x, q.y, q.z])), ['Circulation', 'Streets'], r.name, text)
      for (const o of r.paving) add(line(o, r.z, true), ['Circulation', 'Streets', 'Paving'], r.name, text)
    }
    for (const c of model.courts) add(line(c.outline, c.z, true), ['Circulation', 'Truck courts'], c.name, { 'gfit.court': `${c.massId}:${c.wall}`, ...(c.part ? { 'gfit.part': String(c.part) } : {}), 'gfit.depth': String(c.depth) })

    for (const g of model.grounds) {
      const mesh = new rhino.Mesh()
      const vertices = mesh.vertices()
      for (let i = 0; i < g.x.length; i++) vertices.add(g.x[i], g.y[i], g.z[i])
      const faces = mesh.faces()
      for (let k = 0; k < g.triangles.length; k += 3) faces.addTriFace(g.triangles[k], g.triangles[k + 1], g.triangles[k + 2])
      mesh.normals().computeNormals()
      mesh.compact()
      add(mesh, ['Terrain', g.name], g.name === 'Existing' ? 'Ground' : 'Graded ground', {})
    }
    for (const c of model.contours) add(line(c.points, c.z, c.closed), ['Terrain', 'Contours'], `Contour ${c.z} m`, { 'gfit.z': String(c.z) })

    return doc.toByteArray()
  } finally {
    doc.delete?.()
  }
}
