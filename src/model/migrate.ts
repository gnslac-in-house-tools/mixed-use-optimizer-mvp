// Older projects brought up to the shape this code writes (`PROJECT_VERSION`), before zod checks them. Each step
// takes one version to the next, so a file of any age walks up the chain. Pure: io/gft.ts calls it, MCP can too.
import { buildingColor, freeColor } from './buildingColors.ts'
import { blocksToMetres, joinShortEnds, massesToBlocks, migrateElements, migrateWarehouses } from '../modules/warehouse/engine/migrate.ts'
import { derivedRoadsToStreets } from '../engine/circulation/legacy/toStreets.ts'
import { contourToPolygon } from '../engine/geom/contour.ts'
import { perimeterPath } from '../engine/geom/perimeter.ts'
import { distancePointSegment } from '../engine/geom/polygon.ts'
import { JOIN } from '../engine/path/ends.ts'
import { ContourSchema, PROJECT_VERSION, ProjectSchema } from './schema.ts'

type Json = Record<string, unknown>

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const record = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})

/** The old default height of a new mass: a v1 project without masses gets a level this tall. */
const V1_HEIGHT = 12

/** A step takes a project one version up; `notes` collects what it says of what it did (the report a file opens with, `migrateNotes`). */
const STEPS: Record<number, (p: Json, notes: string[]) => Json> = {
  // v1 → v2 (Decision "Levels"): one level, L1 at the ground, as tall as the tallest mass; everything stands on it and
  // every mass keeps the height it had.
  1: (p) => {
    const heights = list(p.masses)
      .map((m) => record(m).height)
      .filter((h): h is number => typeof h === 'number' && h > 0)
    const level = { id: 'l1', name: 'L1', elevation: 0, height: heights.length ? Math.max(...heights) : V1_HEIGHT, repeat: 1 }
    const onIt = (x: unknown) => (x && typeof x === 'object' ? { ...(x as Json), levelId: level.id } : x)
    return {
      ...p,
      version: 2,
      levels: [level],
      ...(Array.isArray(p.masses) ? { masses: p.masses.map(onIt) } : {}),
      ...(Array.isArray(p.dimensions) ? { dimensions: p.dimensions.map(onIt) } : {}),
    }
  },
  // v2 → v3 (Decision "Buildings and options"): the project's levels become *Building 1*'s, inside *Option 1*; the
  // masses and dimensions keep their levels (level ids stay, so nothing else changes). A new level of it takes the
  // height of its ground floor (the lowest one above ground; or the first).
  2: (p) => {
    const { levels: raw, ...rest } = p
    const levels = list(raw).map(record)
    const measured = levels.filter((l) => typeof l.elevation === 'number' && typeof l.height === 'number' && typeof l.repeat === 'number')
    const ground = [...measured].sort((a, b) => (a.elevation as number) - (b.elevation as number)).find((l) => (l.elevation as number) + (l.height as number) * (l.repeat as number) > 1e-9)
    const height = (ground ?? levels[0])?.height
    const building = { id: 'b1', name: 'Building 1', color: buildingColor(0), levelHeight: typeof height === 'number' && height > 0 ? height : V1_HEIGHT, levels: raw }
    return { ...rest, version: 3, buildings: [building], options: [{ id: 'o1', name: 'Option 1', buildingIds: ['b1'] }] }
  },
  // v3 → v4 (Decision "New mass size"): a program's size was the only way to say how big its new masses are; now they
  // take the brief's area per mass at 2:1, and a size is one set by hand. The old size is kept as the program's typical
  // area (`massArea`): new masses keep their area, their proportion becomes 2:1.
  3: (p) => ({
    ...p,
    version: 4,
    programs: list(p.programs).map((raw) => {
      const { size, ...g } = record(raw)
      const s = record(size)
      return typeof s.width === 'number' && typeof s.depth === 'number' && s.width > 0 && s.depth > 0 ? { ...g, massArea: s.width * s.depth } : g
    }),
  }),
  // v4 → v5 (Decision "Docks on or off"): a program's docks said which walls (one long, both, the short ones, all,
  // none); now they are on or off, on the building's front. *None* drops them; any other keeps them, on the front.
  4: (p) => ({
    ...p,
    version: 5,
    programs: list(p.programs).map((raw) => {
      const g = record(raw)
      if (g.docks === undefined) return g
      const { faces, ...docks } = record(g.docks)
      if (faces !== 'none') return { ...g, docks }
      const { docks: _, ...rest } = g
      return rest
    }),
  }),
  // v5 → v6 (Decision "Project id"): an id, from what the file holds, so the same file opened twice has the same one.
  5: (p) => ({ ...p, version: 6, id: `p-${fingerprint(JSON.stringify(p))}` }),
  // v6 → v7 (Decision "Program rule set"): a program is a rule set, a warehouse type its deep definition, one each. A
  // type's program becomes a Warehouse program; a type without one, or on a program an earlier type already defines,
  // gets a program of its own (named after it; the shared one's docks, colour aside), and its copies' masses on the
  // old program move onto the new one.
  6: (p) => {
    const programs = list(p.programs).map((g) => ({ ...record(g) })) // copies: a Warehouse program's kind is set on it
    const ids = new Set(programs.map((g) => g.id))
    const defined = new Set<unknown>()
    const moved = new Map<string, { from: unknown; to: string }>() // type id → its copies' masses' program, old → new
    const types = list(p.warehouseTypes).map((raw) => {
      const t = record(raw)
      const owner = programs.find((g) => g.id === t.program)
      if (owner && !defined.has(owner.id)) {
        defined.add(owner.id)
        owner.kind = 'warehouse'
        return t
      }
      let n = 1
      while (ids.has(`p${n}`)) n++
      const id = `p${n}`
      ids.add(id)
      const color = freeColor(
        programs.map((g) => ({ color: String(g.color) })),
        buildingColor(programs.length),
      )
      const name = typeof t.name === 'string' ? t.name : 'Warehouse'
      programs.push({ id, name, color, built: true, kind: 'warehouse', ...(owner?.docks !== undefined && { docks: owner.docks }) })
      defined.add(id)
      moved.set(String(t.id), { from: t.program ?? null, to: id })
      return { ...t, program: id }
    })
    // the levels of each moved type's copies, and the program their masses move from and to
    const byLevel = new Map<unknown, { from: unknown; to: string }>()
    for (const raw of list(p.buildings)) {
      const b = record(raw)
      const m = moved.get(String(record(b.warehouse).type))
      if (m) for (const l of list(b.levels)) byLevel.set(record(l).id, m)
    }
    const masses = list(p.masses).map((raw) => {
      const m = record(raw)
      const to = byLevel.get(m.levelId)
      return to && m.part !== undefined && (m.programId ?? null) === to.from ? { ...m, programId: to.to } : raw
    })
    return { ...p, version: 7, programs, ...(Array.isArray(p.warehouseTypes) && { warehouseTypes: types }), ...(Array.isArray(p.masses) && { masses }) }
  },
  // v7 → v8 (Decision "No loose buildings"): a building no option shows goes, with its masses and its levels'
  // dimensions; the project keeps one building at least.
  7: (p) => {
    const shown = new Set(list(p.options).flatMap((o) => list(record(o).buildingIds)))
    const all = list(p.buildings)
    const kept = all.filter((b) => shown.has(record(b).id))
    const buildings = kept.length > 0 ? kept : all.slice(0, 1)
    const levels = new Set(buildings.flatMap((b) => list(record(b).levels).map((l) => record(l).id)))
    const on = (x: unknown) => levels.has(record(x).levelId)
    return {
      ...p,
      version: 8,
      buildings,
      ...(Array.isArray(p.masses) && { masses: p.masses.filter(on) }),
      ...(Array.isArray(p.dimensions) && { dimensions: p.dimensions.filter(on) }),
    }
  },
  // v8 → v9 (Decision "Block shape"): a warehouse type is one mass of one program, its shape an outline on the grid. Its
  // parts out are joined to it (on its program), its parts in and cut corners cut from it, its elements on its edges;
  // each copy's masses one, remade (modules/warehouse/engine/migrate.ts).
  8: (p) => ({ ...migrateWarehouses(p), version: 9 }),
  // v9 → v10 (Decision "Streets", ST.3): an option's roads drawn by hand become its streets, each point a node (one
  // already there, within 5 cm, is joined), of the type its vehicles take (cars: Cars, else Trucks), its width and
  // its vehicles the segment's own where they differ from the type's; a road that was a derived one dragged away
  // leaves that one removed (its `replaces` point among the option's removed roads), as it did.
  9: (p) => ({ ...p, version: 10, options: list(p.options).map((o) => roadsToStreets(p, record(o))) }),
  // v10 → v11 (Decision "Streets", ST.4): no road is derived any more. Each option's derived roads (its buildings'
  // rings, the links from courts and gates, the joins) are drawn once as its streets, so it shows what it showed
  // (engine/circulation/legacy/toStreets.ts); the fields that shaped them go (the rings off, the removed roads, a
  // ring's own parking: its streets park as the option does).
  10: (p) => {
    const options = list(p.options).map(record)
    const drawn = new Map<unknown, unknown>()
    try {
      // the engine reads a Project: the file as zod reads it (its defaults filled, its elements by module), the fields
      // of version 10 kept
      const r = ProjectSchema.safeParse({ ...existingWithSides(streetsWithSides(blocksToMetres(migrateElements(p)))), version: PROJECT_VERSION })
      if (r.success) {
        const legacy = (o: Json) => ({ ...(o.ringOff !== undefined && { ringOff: o.ringOff }), ...(o.removedRoads !== undefined && { removedRoads: o.removedRoads }) })
        const project = { ...r.data, options: r.data.options.map((o) => ({ ...o, ...legacy(options.find((x) => x.id === o.id) ?? {}) })) }
        for (const o of derivedRoadsToStreets(project).options) if (o.streets) drawn.set(o.id, o.streets)
      }
    } catch {
      // a project the engine cannot read keeps the streets it had
    }
    return {
      ...p,
      version: 11,
      options: options.map((o) => ({ ...withoutKeys(o, ['removedRoads', 'ringOff', 'ringParking']), ...(drawn.has(o.id) && { streets: drawn.get(o.id) }) })),
    }
  },
  // v11 → v12 (Decision "Grid by line", GR.1): an end bay under two thirds of a bay joins the bay next to it (it was
  // half a bay). Each block without its own rule laid again, what was listed by bay where it stood, its copies' masses
  // made again (modules/warehouse/engine/migrate.ts).
  11: (p) => ({ ...joinShortEnds(p), version: 12 }),
  // v12 → v13 (Decision "Elements by module", BE.1): a block's docks, doors and patterns one element a module, anchored
  // on the module lines; each rule ("bays 2, 3 and 5", "every nth bay") turned into the modules it placed a piece on, a
  // copy whose block's, anchored on its box, would not stand where its doors stood keeping those as its own
  // (modules/warehouse/engine/migrate.ts).
  12: (p) => ({ ...migrateElements(p), version: 13 }),
  // v13 → v14 (Decision "Padlocks by kind", AS.4): a street segment, a lot, a gate and a building may be `locked`. The fields are
  // optional, so nothing is rewritten; the version goes up so that an older GFit refuses a file whose padlocks it would drop.
  13: (p) => ({ ...p, version: 14 }),
  // v14 → v15 (Phase AS.5): the project may have `referenceLines` and `notes`, and a street segment, a lot, a gate and a dimension a `group`.
  // All are new lists or optional fields, so nothing is rewritten; the version goes up so that an older GFit refuses a file whose reference
  // lines, notes and groups it would drop.
  14: (p) => ({ ...p, version: 15 }),
  // v15 → v16 (Phase D.1): a contour's corner may have a `chamfer` (two set-backs). The field is optional, so nothing is rewritten; the
  // version goes up so that an older GFit refuses a file whose chamfers it would drop.
  15: (p) => ({ ...p, version: 16 }),
  // v16 → v17 (Phase D.2, Decision "Outline in metres"): a block's outline is in metres in its type's frame, its edges named, and its holes are
  // contours: each type and each copy's own shape read from the module lines onto the box it stands on, what it generates unchanged
  // (modules/warehouse/engine/migrate.ts). Then each free mass is a block of its program's type (modules/warehouse/engine/massesToBlocks.ts,
  // Decision "Free masses migrate"), with a report in `notes`.
  16: (p, notes) => ({ ...massesToBlocks(blocksToMetres(p), notes), version: 17 }),
  // v17 → v18 (Phase D.3, Decision "Truck court"): a truck court may have a `shape` of its own (a contour in its wall's frame) and an `id`, on a block's
  // `courts` and on a mass's `blockCourts` (which may have no depth then). The fields are optional, so nothing is rewritten; the version goes up so
  // that an older GFit refuses a file whose shapes it would drop.
  17: (p) => ({ ...p, version: 18 }),
  // v18 → v19 (Phase PE.1, project 19): a street segment keeps the paving each side of its drawn line, `left` and `right`, in place of `width` and
  // `side`: its own width, else its type's (the option's standards counting), centred, or all on the side away from its drawn edge.
  // An existing road likewise: its width split evenly on every stretch.
  18: (p) => ({ ...existingWithSides(streetsWithSides(p)), version: 19 }),
  // v19 → v20 (Phase PE.2, project 20): a street segment and an existing road's stretch may keep their `lanes`, the standards a `laneWidth`, a gate
  // its host (`on`) and an existing road its padlock and group: all optional, so nothing is written for them; the version goes up so that an older
  // GFit refuses a file whose lanes it would drop. The site's frontage goes (Phase PE.2, plan Decision 12): each saved one becomes an existing street
  // (`migrateSite`), with a report in `notes`.
  19: (p, notes) => {
    if (!p.site || typeof p.site !== 'object') return { ...p, version: 20 }
    const was = new Set(list(record(p.site).existingRoads).map((x) => record(x).id))
    const r = migrateSite(record(p.site), record(p.standards))
    notes.push(...r.notes)
    const made = list(r.site.existingRoads).map(record).filter((x) => !was.has(x.id))
    return { ...p, site: r.site, ...(made.length && Array.isArray(p.options) && { options: p.options.map((o) => linkEnds(record(o), made)) }), version: 20 }
  },
}

/**
 * The street ends that lie on the drawn line of one of these existing streets (an end: a node of one segment, linked to no lot or street) are linked to
 * it, as the settle step links an end on a drawn line (Decision "Street links", rule 4): the way a gate had, drawn by an older step, ends on its
 * frontage's line, and the street that frontage became must move it along.
 */
function linkEnds(o: Json, roads: Json[]): Json {
  const streets = record(o.streets)
  if (!Array.isArray(streets.nodes) || !Array.isArray(streets.segments)) return o
  const degree = new Map<unknown, number>()
  for (const g of streets.segments) for (const n of [record(g).a, record(g).b]) degree.set(n, (degree.get(n) ?? 0) + 1)
  const near = (n: Json, r: Json): boolean => {
    const pts = list(r.points).map(record) as { x: number; y: number }[]
    return pts.slice(1).some((b, k) => distancePointSegment({ x: n.x as number, y: n.y as number }, pts[k], b) <= JOIN)
  }
  const nodes = streets.nodes.map((x) => {
    const n = record(x)
    if (n.road !== undefined || n.lot !== undefined || degree.get(n.id) !== 1 || typeof n.x !== 'number' || typeof n.y !== 'number') return x
    const on = roads.find((r) => near(n, r))
    return on ? { ...n, road: on.id } : x
  })
  return { ...o, streets: { ...streets, nodes } }
}

/** m: the paving a saved frontage had when it said no width and the standards none (the engine's default road width). */
const FRONTAGE_WIDTH = 8

/**
 * A site (a project's, or a library terrain's) as the version 20 code reads it (Phase PE.2, plan Decision 12): its existing roads with sides
 * (step 18), and each saved frontage an existing street: the run of the boundary it covered (counter-clockwise, `perimeterPath`) as its drawn line, all
 * its paving outside it (`left` 0, `right` its `streetWidth`, else the standards' `roadWidth`, else 8 m), its id (suffixed `-street` when an existing
 * road has it) and its name (else *Street*). A frontage with no boundary to run along, or a run of no length, is dropped, and the notes say so.
 * Pure; `standards` the project's (`{}` for a terrain).
 */
export function migrateSite(site: Json, standards: Json): { site: Json; notes: string[] } {
  const { frontage, ...rest } = existingSides(site)
  const notes: string[] = []
  const saved = list(frontage).map(record)
  if (!saved.length) return { site: rest, notes }
  const contour = ContourSchema.safeParse(rest.boundary)
  const polygon = contour.success ? contourToPolygon(contour.data) : []
  const existing = list(rest.existingRoads).map(record)
  const taken = new Set(existing.map((r) => String(r.id)))
  const width = (f: Json): number => [f.streetWidth, standards.roadWidth].find((v): v is number => typeof v === 'number' && v > 0) ?? FRONTAGE_WIDTH
  let dropped = 0
  let made = 0
  for (const f of saved) {
    const run = typeof f.from === 'number' && typeof f.to === 'number' ? perimeterPath(polygon, f.from, f.to) : []
    // a point on the one before it (a run that ends where it began, or no length) is no new point
    const points = run.filter((q, i) => i === 0 || Math.hypot(q.x - run[i - 1].x, q.y - run[i - 1].y) > 1e-9)
    if (points.length < 2) {
      dropped++
      continue
    }
    let id = String(f.id)
    if (taken.has(id)) id = `${id}-street`
    for (let n = 2; taken.has(id); n++) id = `${String(f.id)}-street${n}`
    taken.add(id)
    const w = Math.max(0.5, width(f))
    existing.push({ id, points, stretches: points.slice(1).map(() => ({ left: 0, right: w })), name: typeof f.name === 'string' && f.name ? f.name : 'Street' })
    made++
  }
  if (made) notes.push(`The site's frontage became ${made} existing ${made === 1 ? 'street' : 'streets'}.`)
  if (dropped) notes.push(`${dropped} ${dropped === 1 ? 'frontage' : 'frontages'} with no boundary run to follow ${dropped === 1 ? 'was' : 'were'} dropped.`)
  return { site: existing.length ? { ...rest, existingRoads: existing } : rest, notes }
}

/** The project's existing roads with `stretches` in place of `width` (`existingSides`). */
function existingWithSides(p: Json): Json {
  const site = record(p.site)
  return Array.isArray(site.existingRoads) ? { ...p, site: existingSides(site) } : p
}

/** The site's existing roads with `stretches` in place of `width`: half the width each side, on every stretch. */
function existingSides(site: Json): Json {
  if (!Array.isArray(site.existingRoads)) return site
  const existingRoads = site.existingRoads.map((x) => {
    const { width, ...r } = record(x)
    const points = list(r.points)
    if (Array.isArray(r.stretches)) return r
    const w = Math.max(0.5, typeof width === 'number' ? width : 8)
    return { ...r, stretches: points.slice(1).map(() => ({ left: w / 2, right: w / 2 })) }
  })
  return { ...site, existingRoads }
}

/** A project's streets with `left` and `right` in place of `width` and `side` (a segment that has them already keeps them). */
function streetsWithSides(p: Json): Json {
  const standards = record(p.standards)
  const types = list(standards.streetTypes).map(record)
  return {
    ...p,
    options: list(p.options).map((x) => {
      const o = record(x)
      const streets = record(o.streets)
      if (!Array.isArray(streets.segments)) return o
      const own = record(o.standards)
      const figure = (k: 'roadWidth' | 'carRoadWidth', d: number) => [own[k], standards[k], d].find((v) => typeof v === 'number') as number
      // the type's width, as engine/circulation/streets.ts `streetTypesOf` reads it
      const typeWidth = (id: unknown): number => {
        if (types.length) {
          const t = types.find((y) => y.id === id) ?? types[0]
          return typeof t.width === 'number' ? t.width : 8
        }
        return id === 'cars' ? figure('carRoadWidth', 6) : figure('roadWidth', 8)
      }
      const segments = streets.segments.map((g) => {
        const s = record(g)
        const { width, side, ...rest } = s
        if (typeof s.left === 'number' && typeof s.right === 'number') return rest
        const w = Math.max(0.5, typeof width === 'number' ? width : typeWidth(s.type))
        const sides = side === 'left' ? { left: 0, right: w } : side === 'right' ? { left: w, right: 0 } : { left: w / 2, right: w / 2 }
        return { ...rest, ...sides }
      })
      return { ...o, streets: { ...streets, segments } }
    }),
  }
}

const withoutKeys = (o: Json, keys: string[]): Json => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

/** m: a point of an old road this close to a node is that node. */
const SAME_NODE = 0.05

/** An option's roads drawn by hand (v9) as streets (v10). */
function roadsToStreets(p: Json, o: Json): Json {
  const { roads, ...rest } = o
  const drawn = list(roads).map(record)
  if (!drawn.length) return rest
  const standards = record(p.standards)
  const own = record(o.standards)
  const types = list(standards.streetTypes).map(record)
  const widthOf = (k: 'roadWidth' | 'carRoadWidth') => (typeof own[k] === 'number' ? own[k] : standards[k])
  // the default types (engine/circulation/streets.ts): trucks at the road width, cars at the car road width
  const typeFor = (vehicles: unknown): { id: string; width: unknown; vehicles: string } => {
    const want = vehicles === 'cars' ? 'cars' : 'trucks'
    if (types.length) {
      const t = types.find((x) => x.vehicles === want) ?? types[0]
      return { id: String(t.id), width: t.width, vehicles: String(t.vehicles) }
    }
    return want === 'cars' ? { id: 'cars', width: widthOf('carRoadWidth'), vehicles: 'cars' } : { id: 'trucks', width: widthOf('roadWidth'), vehicles: 'trucks' }
  }
  const streets = record(o.streets)
  const nodes = list(streets.nodes).map(record)
  const segments = list(streets.segments).map(record)
  const taken = new Set(list(p.options).flatMap((x) => [...list(record(record(x).streets).nodes), ...list(record(record(x).streets).segments)].map((y) => String(record(y).id))))
  const fresh = (prefix: string) => {
    let n = 1
    while (taken.has(`${prefix}${n}`)) n++
    taken.add(`${prefix}${n}`)
    return `${prefix}${n}`
  }
  const nodeAt = (q: Json): string | null => {
    if (typeof q.x !== 'number' || typeof q.y !== 'number') return null
    const near = nodes.find((n) => Math.hypot((n.x as number) - (q.x as number), (n.y as number) - (q.y as number)) <= SAME_NODE)
    if (near) return String(near.id)
    const id = fresh('n')
    nodes.push({ id, x: q.x, y: q.y })
    return id
  }
  const removed = list(o.removedRoads).map(record)
  for (const r of drawn) {
    const type = typeFor(r.vehicles)
    const width = typeof r.width === 'number' && r.width !== type.width ? { width: r.width } : {}
    const vehicles = typeof r.vehicles === 'string' && r.vehicles !== type.vehicles ? { vehicles: r.vehicles } : {}
    const at = list(r.points)
      .map((q) => nodeAt(record(q)))
      .filter((n): n is string => n !== null)
    at.forEach((b, i) => {
      const a = at[i - 1]
      if (i === 0 || a === b || segments.some((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a))) return
      segments.push({ id: fresh('s'), a, b, type: type.id, ...width, ...vehicles })
    })
    const q = record(r.replaces)
    if (typeof q.x === 'number' && typeof q.y === 'number' && !removed.some((x) => x.x === q.x && x.y === q.y)) removed.push({ x: q.x, y: q.y })
  }
  const used = new Set(segments.flatMap((g) => [g.a, g.b]))
  const kept = nodes.filter((n) => used.has(n.id))
  return {
    ...rest,
    ...(segments.length ? { streets: { nodes: kept, segments } } : {}),
    ...(removed.length ? { removedRoads: removed } : {}),
  }
}

/** A short hash of a text (FNV-1a, twice with other seeds): base 36. */
function fingerprint(text: string): string {
  const hash = (seed: number) => {
    let h = seed >>> 0
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
    return h.toString(36)
  }
  return hash(0x811c9dc5) + hash(0x01234567)
}

/**
 * The project's JSON at the current version (as it came, when it has no version or is already current); `to`: up to
 * that version only (a step's test); and what the steps said (the report: `migrateNotes`).
 */
export function migrated(data: Json, to = PROJECT_VERSION): { data: Json; notes: string[] } {
  const notes: string[] = []
  let p = data
  while (typeof p.version === 'number' && p.version < to) {
    const step = STEPS[p.version]
    if (!step) break
    p = step(p, notes)
  }
  return { data: p, notes }
}

/** The project's JSON at the current version (or `to`). */
export function migrate(data: Json, to = PROJECT_VERSION): Json {
  return migrated(data, to).data
}

/** What migrating said, sentence by sentence (a file of an older GFit whose masses became blocks); empty when there is nothing to say. */
export function migrateNotes(data: Json, to = PROJECT_VERSION): string[] {
  return migrated(data, to).notes
}
