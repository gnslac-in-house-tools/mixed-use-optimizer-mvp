// A Project as an IFC 4 file (Decision "Model export"; Phase 10.3's open hand-off to BIM), written by hand as STEP text:
// what exportModel.ts gathers, nothing to download. The spatial tree is IFC's: the project, its site, the option's
// buildings, a storey per floor of each level (a ×N level gives N storeys) at its z. Each mass an IfcSpace (its program
// the long name): the open BIM reading, for any IFC viewer or checker (its Revit flavour went with the bridge, Decision
// "No Revit bridge"). Each mass: its footprint (holes cut out) extruded by its height, with a property set "GFit" (program, building,
// level, area, height, built, its id; a smart block's zones of other programs, "Office 619.5 m²; …"). The ground (Terrain): an IfcGeographicElement (TERRAIN) per surface, as it is
// and graded, triangles (IfcTriangulatedFaceSet). The streets and existing roads (Decision "Streets"): each an
// IfcCivilElement, its centreline at its graded heights (Axis) and its paving's outline (FootPrint);
// each truck court (Decision "Truck court") one too, a slab 0.15 m thick under its level. In the site, with a property
// set "GFit". The site keeps its latitude, longitude and true north.
import type { Point, Project } from '../model/schema.ts'
import { contourToPolygon } from '../engine/geom/contour.ts'
import { lanesText, modelOf, SLAB, type ExportModel, type ModelCourt, type ModelGround, type ModelMass, type ModelPart, type ModelRoad } from './exportModel.ts'

/** A STEP string: quotes doubled, backslashes escaped, anything beyond ASCII as \X2\ hex (UTF-16). */
export function ifcString(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (ch === "'") out += "''"
    else if (ch === '\\') out += '\\\\'
    else if (c >= 32 && c < 127) out += ch
    else {
      const units = c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c]
      out += `\\X2\\${units.map((u) => u.toString(16).toUpperCase().padStart(4, '0')).join('')}\\X0\\`
    }
  }
  return `'${out}'`
}

/** A STEP real: always with its point, to the millimetre's thousandth. */
export function ifcReal(v: number): string {
  const r = Math.round(v * 1e6) / 1e6
  const s = String(Object.is(r, -0) ? 0 : r)
  return /[.e]/i.test(s) ? s.replace('e', 'E') : `${s}.`
}

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/** An IFC GlobalId (22 characters, IFC's base 64) from a key: the same key, the same id, so a new export of the same mass
 *  is the same object. Four FNV-1a hashes make its 128 bits. */
export function ifcGuid(key: string): string {
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => {
    let h = seed >>> 0
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0
    return Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  })
  // 128 bits as 2 + 21 × 6 bits: the first character carries 2
  let bits = 0n
  for (const w of words) bits = (bits << 32n) | BigInt(w)
  let out = ''
  for (let i = 0; i < 22; i++) {
    out = B64[Number(bits & 63n)] + out
    bits >>= 6n
  }
  return out
}

/** The entities, numbered as they are added. */
class Step {
  readonly lines: string[] = []
  add(entity: string): string {
    this.lines.push(`#${this.lines.length + 1}=${entity};`)
    return `#${this.lines.length}`
  }
}

/** Degrees as IFC's compound angle: degrees, minutes, seconds, millionths of a second, all of the same sign. */
function compound(deg: number): string {
  const sign = deg < 0 ? -1 : 1
  let us = Math.round(Math.abs(deg) * 3600e6)
  const d = Math.floor(us / 3600e6)
  us -= d * 3600e6
  const m = Math.floor(us / 60e6)
  us -= m * 60e6
  const s = Math.floor(us / 1e6)
  us -= s * 1e6
  return `(${[d, m, s, us].map((v) => String(sign * v)).join(',')})`
}

const signedArea = (pts: Point[]) => pts.reduce((a, p, i) => a + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0) / 2
const turned = (pts: Point[], ccw: boolean) => ((signedArea(pts) > 0) === ccw ? pts : [...pts].reverse())

export function exportIfc(p: Project, d: Parameters<typeof modelOf>[1], part: ModelPart = 'all', now = new Date()): string {
  const model = modelOf(p, d, part)
  return writeIfc(model, p.id, now)
}

function writeIfc(model: ExportModel, key: string, now: Date): string {
  const s = new Step()
  const guid = (what: string) => `'${ifcGuid(`${key}:${what}`)}'`
  const str = ifcString
  const real = ifcReal
  const point2 = (q: Point) => s.add(`IFCCARTESIANPOINT((${real(q.x)},${real(q.y)}))`)
  const polyline = (pts: Point[]) => {
    const ids = pts.map(point2)
    return s.add(`IFCPOLYLINE((${[...ids, ids[0]].join(',')}))`)
  }

  // who and what wrote it; the units; where it stands and where north is
  const person = s.add(`IFCPERSON($,$,'',$,$,$,$,$)`)
  const org = s.add(`IFCORGANIZATION($,'GFit',$,$,$)`)
  const owner = s.add(`IFCPERSONANDORGANIZATION(${person},${org},$)`)
  const app = s.add(`IFCAPPLICATION(${org},'1','GFit Generative Information Modeler','GFit')`)
  const oh = s.add(`IFCOWNERHISTORY(${owner},${app},$,.ADDED.,$,$,$,${Math.floor(now.getTime() / 1000)})`)
  const units = s.add(
    `IFCUNITASSIGNMENT((${[
      s.add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`),
      s.add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`),
      s.add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`),
      s.add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`),
    ].join(',')}))`,
  )
  const origin = s.add(`IFCCARTESIANPOINT((0.,0.,0.))`)
  const world = s.add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)
  // the geo's north: degrees counter-clockwise from the plan's +y to true north
  const n = ((model.geo?.north ?? 0) * Math.PI) / 180
  const north = s.add(`IFCDIRECTION((${real(-Math.sin(n))},${real(Math.cos(n))}))`)
  const context = s.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},${north})`)
  const body = s.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`)
  const footprint = s.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('FootPrint','Model',*,*,*,*,${context},$,.PLAN_VIEW.,$)`)
  const axis = s.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`)
  const project = s.add(`IFCPROJECT(${guid('project')},${oh},${str(model.name)},$,$,$,$,(${context}),${units})`)

  const placed = (relTo: string | null, z = 0) =>
    s.add(`IFCLOCALPLACEMENT(${relTo ?? '$'},${z ? s.add(`IFCAXIS2PLACEMENT3D(${s.add(`IFCCARTESIANPOINT((0.,0.,${real(z)}))`)},$,$)`) : world})`)
  const shape = (sub: string, id: string, type: string, items: string[]) =>
    s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${s.add(`IFCSHAPEREPRESENTATION(${sub},${str(id)},${str(type)},(${items.join(',')}))`)}))`)
  const aggregate = (what: string, whole: string, parts: string[]) => parts.length && s.add(`IFCRELAGGREGATES(${guid(`agg:${what}`)},${oh},$,$,${whole},(${parts.join(',')}))`)
  const contain = (what: string, space: string, elements: string[]) =>
    elements.length && s.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`in:${what}`)},${oh},$,$,(${elements.join(',')}),${space})`)

  // the site: its lines as its footprint, its place on the Earth
  const sitePlace = placed(null)
  const siteShape = model.site ? shape(footprint, 'FootPrint', 'Curve2D', [s.add(`IFCGEOMETRICCURVESET((${polyline(turned(contourToPolygon(model.site.boundary), true))}))`)]) : '$'
  const lat = model.geo ? compound(model.geo.lat) : '$'
  const lon = model.geo ? compound(model.geo.lon) : '$'
  const site = s.add(`IFCSITE(${guid('site')},${oh},'Site',$,$,${sitePlace},${siteShape},$,.ELEMENT.,${lat},${lon},0.,$,$)`)
  aggregate('project', project, [site])

  // the ground
  const grounds = model.grounds.map((g) => groundElement(s, g, guid, oh, placed(sitePlace), body))
  // the streets and the courts
  const roads = model.roads.map((r) => roadElement(s, r, guid, oh, placed(sitePlace), { axis, footprint }, polyline))
  const courts = model.courts.map((c) => courtElement(s, c, guid, oh, placed(sitePlace), body, polyline))
  contain('site', site, [...grounds, ...roads, ...courts])

  // the buildings, a storey per floor, the masses in theirs
  const buildings: string[] = []
  for (const b of model.buildings) {
    const place = placed(sitePlace)
    const building = s.add(`IFCBUILDING(${guid(`building:${b.id}`)},${oh},${str(b.name)},$,$,${place},$,$,.ELEMENT.,${real(b.base)},$,$)`)
    buildings.push(building)
    const storeys: string[] = []
    for (const l of b.levels) {
      const mine = model.masses.filter((m) => m.levelId === l.id)
      l.floors.forEach((z, k) => {
        const name = l.floors.length > 1 ? `${l.name} (${k + 1} of ${l.floors.length})` : l.name
        const storeyPlace = placed(place, z)
        const storey = s.add(`IFCBUILDINGSTOREY(${guid(`storey:${l.id}:${k}`)},${oh},${str(name)},$,$,${storeyPlace},$,$,.ELEMENT.,${real(z)})`)
        storeys.push(storey)
        const masses = mine.map((m) => massElement(s, m, k, z, b.name, l.name, guid, oh, placed(storeyPlace), body, polyline))
        aggregate(`storey:${l.id}:${k}`, storey, masses)
      })
    }
    aggregate(`building:${b.id}`, building, storeys)
  }
  aggregate('site', site, buildings)

  const file = `${model.name}.ifc`
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(file)},'${now.toISOString().slice(0, 19)}',(''),('GFit'),'GFit','GFit Generative Information Modeler','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...s.lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

function massElement(
  s: Step,
  m: ModelMass,
  k: number,
  storeyZ: number,
  building: string,
  level: string,
  guid: (what: string) => string,
  oh: string,
  place: string,
  body: string,
  polyline: (pts: Point[]) => string,
): string {
  const outer = polyline(turned(m.polygon, true))
  const holes = m.holes.filter((h) => h.length >= 3).map((h) => polyline(turned(h, false)))
  const profile = holes.length ? s.add(`IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,${outer},(${holes.join(',')}))`) : s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${outer})`)
  // the floor's z over its storey's (a mass on a step of its building's platforms stands apart)
  const dz = m.floors[k] - storeyZ
  const at = s.add(`IFCAXIS2PLACEMENT3D(${s.add(`IFCCARTESIANPOINT((0.,0.,${ifcReal(dz)}))`)},$,$)`)
  const solid = s.add(`IFCEXTRUDEDAREASOLID(${profile},${at},${s.add('IFCDIRECTION((0.,0.,1.))')},${ifcReal(m.height)})`)
  const rep = s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${s.add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)}))`)
  const name = ifcString(m.floors.length > 1 ? `${m.name} (${k + 1} of ${m.floors.length})` : m.name)
  const id = `mass:${m.id}:${k}`
  const element = s.add(`IFCSPACE(${guid(id)},${oh},${name},$,$,${place},${rep},${ifcString(m.program)},.ELEMENT.,${m.built ? '.INTERNAL.' : '.EXTERNAL.'},$)`)
  const props = [
    ['Program', `IFCLABEL(${ifcString(m.program)})`],
    ['Building', `IFCLABEL(${ifcString(building)})`],
    ['Level', `IFCLABEL(${ifcString(level)})`],
    ['Area', `IFCAREAMEASURE(${ifcReal(m.area)})`],
    ['Height', `IFCPOSITIVELENGTHMEASURE(${ifcReal(m.height)})`],
    ['Built', `IFCBOOLEAN(${m.built ? '.T.' : '.F.'})`],
    ['GFit id', `IFCIDENTIFIER(${ifcString(m.id)})`],
    ...(m.zones.length ? [['Zones', `IFCTEXT(${ifcString(zonesText(m))})`]] : []),
  ].map(([n, v]) => s.add(`IFCPROPERTYSINGLEVALUE(${ifcString(n)},$,${v},$)`))
  const pset = s.add(`IFCPROPERTYSET(${guid(`pset:${id}`)},${oh},'GFit',$,(${props.join(',')}))`)
  s.add(`IFCRELDEFINESBYPROPERTIES(${guid(`props:${id}`)},${oh},$,$,(${element}),${pset})`)
  return element
}

/** A property set "GFit" on an element. */
function gfitProps(s: Step, element: string, id: string, props: [string, string][], guid: (what: string) => string, oh: string) {
  const values = props.map(([n, v]) => s.add(`IFCPROPERTYSINGLEVALUE(${ifcString(n)},$,${v},$)`))
  const pset = s.add(`IFCPROPERTYSET(${guid(`pset:${id}`)},${oh},'GFit',$,(${values.join(',')}))`)
  s.add(`IFCRELDEFINESBYPROPERTIES(${guid(`props:${id}`)},${oh},$,$,(${element}),${pset})`)
}

/** A civil element of the site. */
function siteElement(s: Step, id: string, name: string, kind: string, guid: (what: string) => string, oh: string, place: string, rep: string): string {
  return s.add(`IFCCIVILELEMENT(${guid(id)},${oh},${ifcString(name)},$,${ifcString(kind)},${place},${rep},$)`)
}

function roadElement(
  s: Step,
  r: ModelRoad,
  guid: (what: string) => string,
  oh: string,
  place: string,
  ctx: { axis: string; footprint: string },
  polyline: (pts: Point[]) => string,
): string {
  const pts = r.centre.map((q) => s.add(`IFCCARTESIANPOINT((${ifcReal(q.x)},${ifcReal(q.y)},${ifcReal(q.z)}))`))
  const centre = s.add(`IFCPOLYLINE((${pts.join(',')}))`)
  const reps = [s.add(`IFCSHAPEREPRESENTATION(${ctx.axis},'Axis','Curve3D',(${centre}))`)]
  if (r.paving.length) reps.push(s.add(`IFCSHAPEREPRESENTATION(${ctx.footprint},'FootPrint','Curve2D',(${s.add(`IFCGEOMETRICCURVESET((${r.paving.map((o) => polyline(turned(o, true))).join(',')}))`)}))`))
  const rep = s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${reps.join(',')}))`)
  const id = `road:${r.id}`
  const element = siteElement(s, id, r.name, r.name, guid, oh, place, rep)
  gfitProps(s, element, id, [
    ['Width', `IFCPOSITIVELENGTHMEASURE(${ifcReal(r.width)})`],
    ['Left', `IFCNONNEGATIVELENGTHMEASURE(${ifcReal(r.left)})`],
    ['Right', `IFCNONNEGATIVELENGTHMEASURE(${ifcReal(r.right)})`],
    ['Lanes', `IFCLABEL(${ifcString(lanesText(r.lanes, ' '))})`],
    ['LaneCount', `IFCCOUNTMEASURE(${ifcReal(r.lanes.length)})`],
    ['Vehicles', `IFCLABEL(${ifcString(r.vehicles)})`],
    ...(r.type ? ([['Street type', `IFCLABEL(${ifcString(r.type)})`]] as [string, string][]) : []),
    ['GFit id', `IFCIDENTIFIER(${ifcString(r.id)})`],
  ], guid, oh)
  return element
}

function courtElement(s: Step, c: ModelCourt, guid: (what: string) => string, oh: string, place: string, body: string, polyline: (pts: Point[]) => string): string {
  const profile = s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${polyline(turned(c.outline, true))})`)
  const at = s.add(`IFCAXIS2PLACEMENT3D(${s.add(`IFCCARTESIANPOINT((0.,0.,${ifcReal(c.z - SLAB)}))`)},$,$)`)
  const solid = s.add(`IFCEXTRUDEDAREASOLID(${profile},${at},${s.add('IFCDIRECTION((0.,0.,1.))')},${ifcReal(SLAB)})`)
  const rep = s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${s.add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)}))`)
  const id = `court:${c.massId}:${c.wall}${c.part ? `:${c.part}` : ''}`
  const element = siteElement(s, id, c.name, 'Truck court', guid, oh, place, rep)
  gfitProps(s, element, id, [
    ['Depth', `IFCPOSITIVELENGTHMEASURE(${ifcReal(c.depth)})`],
    ['Level', `IFCLENGTHMEASURE(${ifcReal(c.z)})`],
    ['Mass', `IFCIDENTIFIER(${ifcString(c.massId)})`],
  ], guid, oh)
  return element
}

/** A mass's zones of other programs as text: "Office 619.5 m²; Guard house 24 m²". */
export const zonesText = (m: Pick<ModelMass, 'zones'>): string => m.zones.map((z) => `${z.program} ${Math.round(z.area * 10) / 10} m²`).join('; ')

function groundElement(s: Step, g: ModelGround, guid: (what: string) => string, oh: string, place: string, body: string): string {
  const coords: string[] = []
  for (let i = 0; i < g.x.length; i++) coords.push(`(${ifcReal(g.x[i])},${ifcReal(g.y[i])},${ifcReal(g.z[i])})`)
  const index: string[] = []
  for (let k = 0; k < g.triangles.length; k += 3) index.push(`(${g.triangles[k] + 1},${g.triangles[k + 1] + 1},${g.triangles[k + 2] + 1})`)
  const points = s.add(`IFCCARTESIANPOINTLIST3D((${coords.join(',')}))`)
  const faces = s.add(`IFCTRIANGULATEDFACESET(${points},$,.F.,(${index.join(',')}),$)`)
  const rep = s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${s.add(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${faces}))`)}))`)
  const name = g.name === 'Existing' ? 'Ground' : 'Graded ground'
  return s.add(`IFCGEOGRAPHICELEMENT(${guid(`ground:${g.name}`)},${oh},${ifcString(name)},$,$,${place},${rep},$,.TERRAIN.)`)
}
