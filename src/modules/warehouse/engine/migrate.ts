// Blocks from before Decision "Block shape" read into an outline, pure (model/migrate.ts for projects, io/blocks.ts for
// a block's file): the hall and its parts out joined into one outline on the module lines (a part's depth to the
// nearest module), its parts in and cut corners cut from it, every part on the hall's program and height; the box the
// outline's, its bays laid as near the old ones as the ends allow (its column line A / 1 moved by the parts out on the
// low sides: a copy's place moves with it); each wall's thickness and facade offset the old side's; the elements of a
// side on the edges that were the hall's walls there, on the modules they stood on; the zones (and the level steps
// before them) on the new box's lines. A copy's own parts (B.3) become its own outline; its masses one: its hall,
// remade, its parts' masses and level steps gone.
// Then (Decision "Grid by line", GR.1) the end bays joined under two thirds of a bay, what was listed by bay where it
// stood; and (Decision "Elements by module", BE.1) each element's rule ("bays 2, 3 and 5", "every nth bay") read into
// one element on each module it placed a piece on, every door where it stood, a copy's own where its type's anchored
// would not stand there.
import { z } from 'zod'
import { HallElementSchema, type Footprint, type HallElement, type HallSide, type HallZone, type Id, type Mass, type Point, type Polygon, type WarehouseOverrides as MetreOverrides, type WarehouseType as MetreType } from '../../../model/schema.ts'
// the block as it was on its module lines: the old steps run on the frozen engine (Phase D.2, legacy/)
import { LegacyOverridesSchema, LegacyTypeSchema, type LegacyOutlineCorner as OutlineCorner, type LegacyOverrides as WarehouseOverrides, type LegacyType as WarehouseType } from './legacy/types.ts'
import { difference, union } from '../../../engine/geom/boolean.ts'
import { area } from '../../../engine/geom/polygon.ts'
import { endsKeeping, halfBays, hallEnds, moduleLine, moduleOfBay, nearestLine, nearestModule, type Bay, type HallRuns, type JoinRule, type Run } from './bays.ts'
import { copyOnPlan, copyParts, onPlace } from './legacy/copiesLines.ts'
import { freeElementId } from './elements.ts'
import { holeToMetres, linesToMetres } from './shape.ts'
import { edgeBays, elementKey, elementsOn, faceOf, outlineOn, outwardOf, ownBox, shapeNow, shapeOf, tidyOutline, validOutline, boxOutline, edgesOf, type ShapeEdge } from './legacy/lines.ts'
import { boxOf, generate, hallRuns, ownBundle, typeWith } from './legacy/generateLines.ts'

type Json = Record<string, unknown>
type BySide = Record<HallSide, number>
type Corner = 'front-left' | 'front-right' | 'back-right' | 'back-left'

// ---- Elements by rule (before Decision "Elements by module") --------------------------------------------------------

/**
 * An element as blocks of format 3 and projects of version 12 kept it: on an edge (its id), in the bays it picks along
 * it (listed by index from the edge's low end, or every `every`th from the `offset`th, the end bays skipped or not),
 * `count` of them centred in each bay `pitch` m apart (absent: a module), each `width` m.
 */
export const LegacyElementSchema = z.object({
  id: z.string(),
  kind: z.enum(['dock', 'door', 'pattern']),
  name: z.string().optional(),
  edge: z.string(),
  bays: z.union([
    z.array(z.number().int().min(0)),
    z.object({ every: z.number().int().min(1), offset: z.number().int().min(0), skip: z.enum(['none', 'ends']) }),
  ]),
  count: z.number().int().min(1),
  pitch: z.number().positive().optional(),
  width: z.number().positive(),
})
export type LegacyElement = z.infer<typeof LegacyElementSchema>
/** A type whose elements may be rules still. */
export type OldElementsType = Omit<WarehouseType, 'elements'> & { elements: (HallElement | LegacyElement)[] }
export type OldElementsOverrides = Omit<WarehouseOverrides, 'elements'> & { elements?: (HallElement | LegacyElement)[] }
const OldElementsTypeSchema = LegacyTypeSchema.extend({ elements: z.array(z.union([HallElementSchema, LegacyElementSchema])) })

const isLegacy = (el: HallElement | LegacyElement): el is LegacyElement => 'bays' in el
const anyLegacy = (els: (HallElement | LegacyElement)[] | undefined) => !!els?.some(isLegacy)

/** The bays a rule picks along its edge: listed, or every so many from an offset (the end bays left out or not). */
export function pickedBays(bays: Bay[], pick: LegacyElement['bays']): Bay[] {
  if (Array.isArray(pick)) return pick.filter((i) => i < bays.length).map((i) => bays[i])
  const from = pick.skip === 'ends' ? bays.filter((b) => !b.end) : bays
  return from.filter((_, j) => j >= pick.offset && (j - pick.offset) % pick.every === 0)
}

/** Where a rule's pieces stood along its edge (m along the edge's line), as the generator put them: centred in each bay
 *  it picks, a pitch apart, each wholly on the edge. */
export function legacySpots(runs: HallRuns, e: ShapeEdge, el: Pick<LegacyElement, 'bays' | 'count' | 'pitch' | 'width'>): number[] {
  const lo = Math.min(e.horizontal ? e.a.x : e.a.y, e.horizontal ? e.b.x : e.b.y)
  const hi = Math.max(e.horizontal ? e.a.x : e.a.y, e.horizontal ? e.b.x : e.b.y)
  return pickedBays(edgeBays(runs, e), el.bays).flatMap((bay) => {
    const c = (bay.lo + bay.hi) / 2
    const pitch = el.pitch ?? moduleOfBay(bay)
    return Array.from({ length: el.count }, (_, i) => mm(c + (i - (el.count - 1) / 2) * pitch)).filter((s) => s - el.width / 2 >= lo - ON && s + el.width / 2 <= hi + ON)
  })
}

/** A type as the generator read it before (its elements rules or by module): its overrides each figure over its own. */
export function oldElementsWith(t: OldElementsType, o: OldElementsOverrides | undefined): OldElementsType {
  if (!o) return t
  const { elements, ...rest } = o
  const made = typeWith({ ...t, elements: [] }, rest as WarehouseOverrides) as OldElementsType
  return { ...made, elements: elements ?? t.elements }
}

/** Where the generator put a type's doors (its elements rules or by module): each one's edge, kind and middle. */
export function legacyDoorsAt(t: OldElementsType): { edge: Id; kind: HallElement['kind']; at: Point }[] {
  const runs = hallRuns(t)
  const { edges } = shapeOf(t, runs)
  const g = generate({ ...t, elements: t.elements.filter((el): el is HallElement => !isLegacy(el)) })
  const out = g.doors.map((d) => ({ edge: d.edge, kind: d.kind, at: d.at }))
  for (const el of t.elements) {
    const e = isLegacy(el) ? edges.find((x) => x.id === el.edge) : undefined
    if (!e || !isLegacy(el)) continue
    const out1 = outwardOf(e.side)
    const across = mm(e.horizontal ? e.a.y + out1.y * faceOf(e) : e.a.x + out1.x * faceOf(e))
    for (const s of legacySpots(runs, e, el)) out.push({ edge: e.id, kind: el.kind, at: e.horizontal ? { x: s, y: across } : { x: across, y: s } })
  }
  return out
}

/** Each rule's pieces as elements on the modules they stood on (the nearest centre; two of one kind, a pattern of one
 *  name, on one module one),
 *  counted on the box now; an element by module as it stands on it (`elementsOn`). Fresh ids e1, e2… for the new. */
function modulesNow(t: OldElementsType): HallElement[] {
  const runs = hallRuns(t)
  const { edges } = shapeOf(t, runs)
  const placed = elementsOn({ elements: t.elements.filter((el): el is HallElement => !isLegacy(el)) }, runs, edges)
  const out: HallElement[] = []
  const seen = new Set<string>()
  const add = (el: HallElement) => {
    const key = elementKey(el)
    if (seen.has(key)) return
    seen.add(key)
    out.push(el)
  }
  const kept = new Map(placed.map((el) => [el.id, el]))
  const fresh: HallElement[] = []
  for (const el of t.elements) {
    if (!isLegacy(el)) {
      const at = kept.get(el.id)
      if (at) add(at)
      continue
    }
    const e = edges.find((x) => x.id === el.edge)
    if (!e) continue
    const r = e.horizontal ? runs.x : runs.y
    for (const s of legacySpots(runs, e, el)) {
      const made: HallElement = { id: '', kind: el.kind, ...(el.name !== undefined ? { name: el.name } : {}), edge: el.edge, module: nearestModule(r, s), width: el.width }
      const before = out.length
      add(made)
      if (out.length > before) fresh.push(made)
    }
  }
  for (const el of fresh) el.id = freeElementId(out)
  return out
}

/**
 * A type's elements by module (Decision "Elements by module"): each rule turned into one element on each module it
 * placed a piece on, so nothing moves; counted on the box as it is now (its hall's), as a type's are. A piece off a
 * module centre goes to the module whose centre is nearest, two of one kind (a pattern of one name) on one module are
 * one.
 */
export function elementsByModule(t: OldElementsType): HallElement[] {
  return modulesNow(t)
}

/**
 * A type with its elements by module, on its box now, and its shape drawn on that box too when it was drawn on another
 * (one frame for corners, holes, zones and elements: Decision "Elements by module"). Already so: as it is.
 */
export function typeByModule(t: OldElementsType): WarehouseType {
  const runs = hallRuns(t)
  const box = boxOf(runs)
  const own = t.morphology.outline.length >= 4 ? ownBox(t.morphology.outline) : box
  const elsewhere = own.x !== box.x || own.y !== box.y
  if (!anyLegacy(t.elements) && !elsewhere) return t as WarehouseType
  const elements = anyLegacy(t.elements) ? modulesNow(t) : (t.elements as HallElement[])
  return elsewhere ? { ...t, morphology: shapeNow(t, runs), elements } : { ...t, elements }
}

/** Whether a copy keeps an outline of its own. */
const hasOwnOutline = (o: WarehouseOverrides | undefined) => (o?.morphology?.outline?.length ?? 0) >= 4

/** Two lists of elements on the same modules (their ids aside). */
function sameElements(a: HallElement[], b: HallElement[]): boolean {
  const key = (l: HallElement[]) => l.map((e) => `${e.kind}|${e.name ?? ''}|${e.edge}|${e.module}|${e.width}`).sort().join(';')
  return key(a) === key(b)
}

/**
 * A copy's overrides with its own elements (`now`: on its box now, the copy made of its type and the rest of its
 * overrides): none when its type's, anchored there, are these; else these, with its shape as it stands on that box
 * drawn there as its own (its own elements are counted on its own outline's box, so its type's later edits never
 * change what they mean).
 */
function ownElements(t: WarehouseType, o: WarehouseOverrides, now: HallElement[]): WarehouseOverrides {
  const { elements: _, ...rest } = o
  const c = typeWith(t, rest)
  const runs = hallRuns(c)
  const { edges } = shapeOf(c, runs)
  // a copy with its own outline keeps its own elements with it, always (one bundle: `ownBundle`)
  if (!hasOwnOutline(rest) && sameElements(elementsOn(c, runs, edges), now)) return rest
  return { ...rest, morphology: { ...rest.morphology, ...shapeNow(c, runs) }, elements: now }
}

type DoorAt = { edge: Id; kind: string; at: Point }
/** Two sets of doors where the same stand, each within a few mm (a module's centre and a rule's piece on it differ by
 *  their rounding). */
function sameDoors(a: DoorAt[], b: DoorAt[]): boolean {
  if (a.length !== b.length) return false
  const cm = (v: number) => Math.round(v * 100)
  const order = (l: DoorAt[]) => [...l].sort((p, q) => p.edge.localeCompare(q.edge) || p.kind.localeCompare(q.kind) || cm(p.at.x) - cm(q.at.x) || cm(p.at.y) - cm(q.at.y))
  const x = order(a)
  const y = order(b)
  return x.every((d, i) => d.edge === y[i].edge && d.kind === y[i].kind && Math.abs(d.at.x - y[i].at.x) < NEAR && Math.abs(d.at.y - y[i].at.y) < NEAR)
}
/** m: two doors this close stand where the other does. */
const NEAR = 0.003

/** A copy's masses (each by its part, on its building's levels) as its type makes them now; `b` its building. */
function remadeMasses(masses: Json[], b: Json, t: WarehouseType, copy: { place: { x: number; y: number; angle: number }; overrides?: WarehouseOverrides }): Json[] {
  const levels = new Set(list(b.levels).map((l) => l.id))
  const made = new Map(copyParts(t, copy).map((x) => [x.part, x]))
  return masses.map((m) => {
    const x = typeof m.part === 'string' && levels.has(m.levelId) ? made.get(m.part) : undefined
    if (!x) return m
    const { holes: _, doorsAt: __, zones: ___, blockCourts: ____, ...rest } = m
    return {
      ...rest,
      footprint: x.footprint,
      ...(x.holes.length ? { holes: x.holes } : {}),
      docks: x.docks,
      ...(x.docks.length || x.doorsAt.length ? { doorsAt: x.doorsAt } : {}),
      ...(x.blockCourts.length ? { blockCourts: x.blockCourts } : {}),
      ...(x.zones.length ? { zones: x.zones } : {}),
    }
  })
}

/** Where a copy stands now: its place read from its hall (a hall moved by hand since it was made). */
function standing(t: OldElementsType, w: { type: Id; place: { x: number; y: number; angle: number }; overrides?: OldElementsOverrides }, b: Json, masses: Json[]) {
  const lv = new Set(list(b.levels).map((l) => l.id))
  const hall = masses.find((m) => lv.has(m.levelId) && m.part === 'hall') as { footprint?: Footprint } | undefined
  const { elements: _, ...overrides } = w.overrides ?? {}
  const at = copyOnPlan({ ...t, elements: [] } as WarehouseType, { ...w, overrides: overrides as WarehouseOverrides }, hall?.footprint)
  return at.place
}

/**
 * A project of version 12 with its elements by module (Decision "Elements by module"): each block's rules turned into
 * one element a module (`typeByModule`); each copy's own rules too, and a copy whose block's elements, anchored on its
 * box (one of another length), would not stand where its doors stood gets those as its own; a copy whose doors still
 * moved (a piece off a module centre) has its masses made again.
 */
export function migrateElements(p: Json): Json {
  const types = new Map<Id, { old: OldElementsType; type: WarehouseType }>()
  let any = false
  const warehouseTypes = list(p.warehouseTypes).map((raw) => {
    const r = OldElementsTypeSchema.safeParse(raw)
    if (!r.success) return raw
    const old = r.data as OldElementsType
    const type = typeOrNone(old)
    types.set(old.id, { old, type })
    if (type === old) return raw
    any = true
    return type as unknown as Json
  })
  let masses = list(p.masses)
  const buildings = list(p.buildings).map((b) => {
    const w = b.warehouse as { type: Id; place: { x: number; y: number; angle: number }; overrides?: OldElementsOverrides } | undefined
    const c = w && types.get(w.type)
    if (!w || !c) return b
    try {
      // no rule: its own shape one bundle with its own elements (`ownBundle`), else as it is
      if (!anyLegacy(w.overrides?.elements) && !anyLegacy(c.old.elements)) {
        const bundled = ownBundle(c.type, w.overrides as WarehouseOverrides | undefined)
        if (bundled === w.overrides) return b
        any = true
        return { ...b, warehouse: { ...w, overrides: bundled } }
      }
      // its own rules, or its block's: by module where they stand on it
      const effective = oldElementsWith(c.old, w.overrides)
      const was = legacyDoorsAt(effective)
      const { elements: _, ...rest } = w.overrides ?? {}
      let overrides = rest as WarehouseOverrides
      if (w.overrides?.elements || hasOwnOutline(overrides) || !sameDoors(generate(typeWith(c.type, overrides)).doors, was)) overrides = ownElements(c.type, overrides, modulesNow(effective))
      const moved = !sameDoors(generate(typeWith(c.type, overrides)).doors, was)
      if (!moved && JSON.stringify(overrides) === JSON.stringify(w.overrides ?? {})) return b
      any = true
      const { overrides: __, ...plain } = w
      let copy = Object.keys(overrides).length ? { ...plain, overrides } : plain
      // a piece off a module centre moved a little: its masses made again where its hall stands
      if (moved) {
        copy = { ...copy, place: standing(c.old, w, b, masses) }
        masses = remadeMasses(masses, b, c.type, copy)
      }
      return { ...b, warehouse: copy }
    } catch {
      // a copy the engine cannot make: never its rules left (the file would not read); by module as they stood with its
      // shape as its own (own elements, own shape), or its block's
      if (!anyLegacy(w.overrides?.elements)) return b
      any = true
      const { elements: _, ...rest } = w.overrides!
      const effective = orNone(() => oldElementsWith(c.old, w.overrides))
      const elements = effective && orNone(() => modulesNow(effective))
      const shape = effective && elements && orNone(() => shapeNow(effective, hallRuns(effective)))
      return { ...b, warehouse: { ...w, overrides: elements && shape ? { ...rest, morphology: { ...rest.morphology, ...shape }, elements } : rest } }
    }
  })
  return any ? { ...p, warehouseTypes, buildings, masses } : p
}

/**
 * A type by module (`read`: `typeByModule`) that never stops a file from opening: one the engine cannot read keeps its
 * rules by module as they stand, or none, never a rule (the file would not read).
 */
export function typeOrNone(old: OldElementsType, read: (t: OldElementsType) => WarehouseType = typeByModule): WarehouseType {
  return orNone(() => read(old)) ?? ({ ...old, elements: orNone(() => modulesNow(old)) ?? [] } as WarehouseType)
}

/** What the engine reads, or none when it cannot. */
function orNone<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

/** A part of the old morphology. */
interface OldPart {
  id: Id
  name?: string
  kind: 'out' | 'in'
  side: HallSide
  from: number
  span: number
  depth: number
}
/** An old element, on a side. */
type OldElement = Omit<LegacyElement, 'edge'> & { side: HallSide }
/** An old type: its envelope by side, its morphology of parts, offsets, cut corners and level steps. */
interface OldType {
  id: Id
  name: string
  program: Id | null
  grid: WarehouseType['grid']
  hall: WarehouseType['hall']
  columns: WarehouseType['columns']
  envelope: { height: number; thickness: BySide }
  morphology: { parts: OldPart[]; offsets: BySide; corners: { corner: Corner; x: number; y: number }[]; levels: { at: number; level: number }[]; zones?: HallZone[] }
  elements: OldElement[]
  locks?: WarehouseType['locks']
  library?: WarehouseType['library']
}
/** A copy's old overrides: a step's figures, its parts' own changes. */
type OldOverrides = Partial<{
  grid: Partial<WarehouseType['grid']>
  hall: Partial<WarehouseType['hall']>
  columns: Partial<WarehouseType['columns']>
  envelope: Partial<{ height: number; thickness: Partial<BySide> }>
  morphology: Partial<OldType['morphology']>
  elements: OldElement[]
  program: Id | null
  parts: Record<Id, Partial<{ from: number; span: number; depth: number; removed: true }>>
}>

const SIDES: HallSide[] = ['front', 'back', 'left', 'right']
const ON = 0.005
/** m: how far past the box a cut reaches (it only has to). */
const FAR = 1e4
const mm = (v: number) => Math.round(v * 1000) / 1000
const isRecord = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

/** Whether a type is of the old shape: parts, elements by side, a wall's thickness by side. */
export function isOldType(t: unknown): boolean {
  if (!isRecord(t)) return false
  const m = t.morphology
  const e = t.envelope
  return (isRecord(m) && Array.isArray(m.parts)) || (isRecord(e) && isRecord(e.thickness)) || (Array.isArray(t.elements) && t.elements.some((x) => isRecord(x) && 'side' in x))
}

/** The old figures with what was missing filled in (an old file kept only what it had). */
function normal(raw: Json): OldType {
  const t = raw as unknown as OldType
  const th = isRecord(t.envelope?.thickness) ? (t.envelope.thickness as BySide) : { front: 0.3, back: 0.3, left: 0.3, right: 0.3 }
  const m = (isRecord(t.morphology) ? t.morphology : {}) as Partial<OldType['morphology']>
  return {
    ...t,
    envelope: { height: t.envelope?.height ?? 12, thickness: th },
    morphology: { parts: m.parts ?? [], offsets: m.offsets ?? { front: 0, back: 0, left: 0, right: 0 }, corners: m.corners ?? [], levels: m.levels ?? [], ...(m.zones ? { zones: m.zones } : {}) },
    elements: (t.elements ?? []).map((e) => ({ ...e, side: (e as OldElement).side ?? 'front' })),
  }
}

// laid as they were then: an end bay joined under half a bay (Decision "Grid by line" came later: joinShortEnds)
const oldRuns = (t: Pick<OldType, 'grid' | 'hall'>): HallRuns => hallRuns(t, halfBays(t.grid))
const runOf = (r: HallRuns, side: HallSide): Run => (side === 'front' || side === 'back' ? r.x : r.y)
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

/** An old type with a copy's old overrides, as the old code made it: each part moved, smaller or gone, kept on its side. */
export function oldTypeWith(t: OldType, o: OldOverrides | undefined): OldType {
  if (!o) return t
  const made: OldType = {
    ...t,
    program: o.program !== undefined ? o.program : t.program,
    grid: { ...t.grid, ...o.grid },
    hall: { ...t.hall, ...o.hall },
    columns: { ...t.columns, ...o.columns },
    envelope: { ...t.envelope, ...o.envelope, thickness: { ...t.envelope.thickness, ...o.envelope?.thickness } } as OldType['envelope'],
    morphology: { ...t.morphology, ...o.morphology } as OldType['morphology'],
    elements: o.elements ?? t.elements,
  }
  const runs = oldRuns(made)
  const parts = made.morphology.parts.flatMap((p) => {
    const c = o.parts?.[p.id]
    if (c?.removed) return []
    const span = Math.min(p.span, c?.span ?? p.span)
    const n = runOf(runs, p.side).modules.length - 1
    const from = Math.max(0, Math.min(c?.from ?? p.from, n - span))
    const depth = Math.min(p.depth, c?.depth ?? p.depth)
    return [{ ...p, from, span, depth }]
  })
  return { ...made, morphology: { ...made.morphology, parts } }
}

/** The old zones: its own, or its level steps as zones across the width, or none. */
function oldZones(t: OldType, runs: HallRuns): HallZone[] {
  const nx = runs.x.modules.length - 1
  const ny = runs.y.modules.length - 1
  if (t.morphology.zones?.length) return t.morphology.zones
  const inner = runs.x.lines.length - 2
  const steps = [...t.morphology.levels].filter((l) => l.at >= 1 && l.at <= inner).sort((a, b) => a.at - b.at)
  if (!steps.length) return []
  const lineModule = (k: number) => runs.x.bays.slice(0, k).reduce((n, b) => n + b.modules, 0)
  const bounds = [0, ...steps.map((s) => lineModule(s.at)), nx]
  return bounds
    .slice(0, -1)
    .map((lo, i): HallZone => ({ id: `${i + 1}`, x: [lo, bounds[i + 1]], y: [0, ny], ...(i > 0 && steps[i - 1].level !== 0 ? { level: steps[i - 1].level } : {}) }))
    .filter((z) => z.x[1] > z.x[0])
}

/** The most common of a side's figures (the front's when as common). */
function most(v: BySide): number {
  const n = (x: number) => SIDES.filter((s) => Math.abs(v[s] - x) < 1e-9).length
  return SIDES.map((s) => v[s]).reduce((best, x) => (n(x) > n(best) ? x : best), v.front)
}

/** An old type as a new one, and where the new box's column line A / 1 stands in the old type's frame (m). */
export function typeFromOld(raw: Json): { type: WarehouseType; shift: Point } {
  const t = normal(raw)
  const runs = oldRuns(t)
  const L = runs.x.length
  const W = runs.y.length
  // the column lines' region: the box and its parts out, less its parts in and cut corners
  const along = (p: OldPart): [number, number] => {
    const r = runOf(runs, p.side)
    return [moduleLine(r, p.from), moduleLine(r, p.from + p.span)]
  }
  const part = (p: OldPart): Polygon | null => {
    const [a, b] = along(p)
    if (b - a < ON) return null
    const d = p.depth
    if (p.kind === 'out') return p.side === 'front' ? rect(a, -d, b, 0) : p.side === 'back' ? rect(a, W, b, W + d) : p.side === 'left' ? rect(-d, a, 0, b) : rect(L, a, L + d, b)
    return p.side === 'front' ? rect(a, -FAR, b, d) : p.side === 'back' ? rect(a, W - d, b, W + FAR) : p.side === 'left' ? rect(-FAR, a, d, b) : rect(L - d, a, L + FAR, b)
  }
  const some = (x: Polygon | null): x is Polygon => x !== null
  const outs = t.morphology.parts.filter((p) => p.kind === 'out').map(part).filter(some)
  const ins = t.morphology.parts.filter((p) => p.kind === 'in').map(part).filter(some)
  const lastX = runs.x.modules.length - 1
  const lastY = runs.y.modules.length - 1
  const cuts = t.morphology.corners.map((c) => {
    const left = c.corner.endsWith('left')
    const front = c.corner.startsWith('front')
    const x = left ? moduleLine(runs.x, c.x) : moduleLine(runs.x, lastX - c.x)
    const y = front ? moduleLine(runs.y, c.y) : moduleLine(runs.y, lastY - c.y)
    return rect(left ? -FAR : x, front ? -FAR : y, left ? x : L + FAR, front ? y : W + FAR)
  })
  let region: Polygon = rect(0, 0, L, W)
  if (outs.length) region = largest(union([region], outs)) ?? region
  if (ins.length || cuts.length) region = largest(difference([region], [...ins, ...cuts])) ?? region

  // the new box round it, its bays laid as near the old ones as can be
  const xs = region.map((q) => q.x)
  const ys = region.map((q) => q.y)
  const shift = { x: mm(Math.min(...xs)), y: mm(Math.min(...ys)) }
  const length = mm(Math.max(...xs) - shift.x)
  const width = mm(Math.max(...ys) - shift.y)
  // the bays laid as near the old ones as the ends allow, the region's corners on module lines
  const keep = (r: Run, d: number, extra: number[]) => ({ lines: r.lines.map((v) => v - d), modules: [...r.modules.map((v) => v - d), ...extra.map((v) => v - d)] })
  const ends = hallEnds(endsKeeping({ x: length, y: width }, t.grid, { x: t.hall.ends, y: t.hall.ends, joinUnder: halfBays(t.grid) }, { x: keep(runs.x, shift.x, xs), y: keep(runs.y, shift.y, ys) }))
  const { endsWidth: _, shortEnds: __, ...was } = t.hall
  const hall = { ...was, length, width, ...ends }
  const next = hallRuns({ grid: t.grid, hall }, halfBays(t.grid))
  const nx = next.x.modules.length - 1
  const ny = next.y.modules.length - 1

  // the outline on its module lines, counter-clockwise; each edge its old side's wall
  const thickness = most(t.envelope.thickness)
  const ring = toCcw(region)
  let corners: OutlineCorner[] = ring.map((q, i) => ({ id: `c${i}`, x: clampLine(nearestLine(next.x, q.x - shift.x), nx), y: clampLine(nearestLine(next.y, q.y - shift.y), ny) }))
  corners = tidyOutline(corners).outline
  if (!validOutline(corners)) corners = boxOutline(nx, ny)
  const outline = nameEdges(corners, next, t, shift, thickness)

  const edges = edgesOf(outline, next, thickness)
  const elements = elementsFromOld(t, runs, next, edges, shift)

  // the zones on the new box's lines, the old box's walls the new one's
  const zones = oldZones(t, runs).map((z) => {
    const line = (r: Run, nr: Run, k: number, n: number, nn: number, d: number) => (k <= 0 ? 0 : k >= n ? nn : clampLine(nearestLine(nr, moduleLine(r, k) - d), nn))
    return { ...z, x: [line(runs.x, next.x, z.x[0], lastX, nx, shift.x), line(runs.x, next.x, z.x[1], lastX, nx, shift.x)] as [number, number], y: [line(runs.y, next.y, z.y[0], lastY, ny, shift.y), line(runs.y, next.y, z.y[1], lastY, ny, shift.y)] as [number, number] }
  }).filter((z) => z.x[1] > z.x[0] && z.y[1] > z.y[0])

  const type: WarehouseType = {
    id: t.id,
    name: t.name,
    program: t.program,
    grid: t.grid,
    hall,
    columns: t.columns,
    envelope: { height: t.envelope.height, thickness },
    morphology: { outline, holes: [], ...(zones.length ? { zones } : {}) },
    elements,
    ...(t.locks ? { locks: t.locks } : {}),
    ...(t.library ? { library: t.library } : {}),
  }
  return { type, shift }
}

const clampLine = (k: number, n: number) => Math.max(0, Math.min(n, k))

/** The largest outer ring of a boolean's regions. */
function largest(regions: Polygon[][]): Polygon | null {
  let best: Polygon | null = null
  for (const r of regions) if (r[0] && (!best || area(r[0]) > area(best))) best = r[0]
  return best
}

function toCcw(p: Polygon): Polygon {
  let s = 0
  p.forEach((a, i) => {
    const b = p[(i + 1) % p.length]
    s += a.x * b.y - b.x * a.y
  })
  return s >= 0 ? p : p.slice().reverse()
}

/**
 * The outline's edges named: the longest edge on each of the old hall's walls e1 (front), e2 (right), e3 (back), e4
 * (left), as a new type's box; the others e5, e6… in order. Each edge its old side's wall, where it is not the most
 * common one, and its old side's facade offset.
 */
function nameEdges(c: OutlineCorner[], runs: HallRuns, t: OldType, shift: Point, thickness: number): OutlineCorner[] {
  const edges = edgesOf(c, runs, thickness)
  const across = (e: ShapeEdge) => (e.horizontal ? e.a.y + shift.y : e.a.x + shift.x)
  const wall: Record<HallSide, number> = { front: 0, back: t.hall.width, left: 0, right: t.hall.length }
  const named = new Map<number, Id>()
  const boxIds: Record<HallSide, Id> = { front: 'e1', right: 'e2', back: 'e3', left: 'e4' }
  for (const side of SIDES) {
    const on = edges.filter((e) => e.side === side && Math.abs(across(e) - wall[side]) < ON)
    const pool = on.length ? on : edges.filter((e) => e.side === side)
    const best = pool.reduce<ShapeEdge | null>((b, e) => (!b || length(e) > length(b) ? e : b), null)
    if (best && !named.has(best.index)) named.set(best.index, boxIds[side])
  }
  let n = 5
  return c.map((k, i) => {
    const e = edges[i]
    const id = named.get(i) ?? `e${n++}`
    const th = t.envelope.thickness[e.side]
    const off = t.morphology.offsets[e.side]
    return { id, x: k.x, y: k.y, ...(Math.abs(th - thickness) > 1e-9 && { thickness: th }), ...(off > 0 && { offset: off }) }
  })
}

const length = (e: ShapeEdge) => Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)

/**
 * The old elements on the new edges: each piece where the old code put it (centred in its bays along its side, on the
 * hall's outermost wall there) found on the edge that is that wall now, one element on the module it stands on
 * (Decision "Elements by module"; the nearest centre, two of one kind on one module one). A piece on no wall goes.
 */
function elementsFromOld(t: OldType, runs: HallRuns, next: HallRuns, edges: ShapeEdge[], shift: Point): HallElement[] {
  const out: HallElement[] = []
  const seen = new Set<string>()
  for (const el of t.elements) {
    const { side } = el
    const r = runOf(runs, side)
    const horizontal = side === 'front' || side === 'back'
    const d = horizontal ? shift.x : shift.y
    const spots = pickedBays(r.bays, el.bays).flatMap((bay) => {
      const c = (bay.lo + bay.hi) / 2
      const pitch = el.pitch ?? moduleOfBay(bay)
      return Array.from({ length: el.count }, (_, i) => mm(c + (i - (el.count - 1) / 2) * pitch - d))
    })
    // the hall's walls facing that side: not the face of a part out (beyond the old box)
    const walls = edges.filter((e) => {
      if (e.side !== side) return false
      const a = e.horizontal ? e.a.y + shift.y : e.a.x + shift.x
      return a >= -ON && a <= (horizontal ? t.hall.width : t.hall.length) + ON
    })
    const outward = (e: ShapeEdge) => (side === 'front' ? -e.a.y : side === 'back' ? e.a.y : side === 'left' ? -e.a.x : e.a.x)
    for (const s of spots) {
      const fits = walls.filter((e) => {
        const lo = Math.min(e.horizontal ? e.a.x : e.a.y, e.horizontal ? e.b.x : e.b.y)
        const hi = Math.max(e.horizontal ? e.a.x : e.a.y, e.horizontal ? e.b.x : e.b.y)
        return s - el.width / 2 >= lo - ON && s + el.width / 2 <= hi + ON
      })
      if (!fits.length) continue
      const w = fits.reduce((b, e) => (outward(e) > outward(b) ? e : b))
      const module = nearestModule(w.horizontal ? next.x : next.y, s)
      const key = elementKey({ kind: el.kind, name: el.name, edge: w.id, module })
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: freeElementId(out), kind: el.kind, ...(el.name !== undefined ? { name: el.name } : {}), edge: w.id, module, width: el.width })
    }
  }
  return out
}

// ---- Projects -------------------------------------------------------------------------------------------------------

const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isRecord) : [])

/** What a new type is of an effective one: the figures where they are not its type's. */
function diffOverrides(type: WarehouseType, made: WarehouseType, old: OldOverrides | undefined): WarehouseOverrides {
  const o: WarehouseOverrides = {}
  if (old?.grid) o.grid = old.grid
  if (old?.columns) o.columns = old.columns
  if (old?.program !== undefined) o.program = old.program
  const hall: Partial<WarehouseType['hall']> = {}
  for (const k of ['length', 'width', 'ends', 'endsWidth', 'shortEnds'] as const) if (JSON.stringify(made.hall[k]) !== JSON.stringify(type.hall[k])) (hall as Json)[k] = made.hall[k]
  if (old?.hall?.range) hall.range = old.hall.range
  if (Object.keys(hall).length) o.hall = hall
  const envelope: Partial<WarehouseType['envelope']> = {}
  if (made.envelope.height !== type.envelope.height) envelope.height = made.envelope.height
  if (made.envelope.thickness !== type.envelope.thickness) envelope.thickness = made.envelope.thickness
  if (Object.keys(envelope).length) o.envelope = envelope
  const runs = hallRuns(made, halfBays(made.grid))
  const typeOn = outlineOn(type.morphology, runs.x.modules.length - 1, runs.y.modules.length - 1)
  if (JSON.stringify(typeOn) !== JSON.stringify(made.morphology.outline)) o.morphology = { outline: made.morphology.outline }
  if (JSON.stringify(made.morphology.zones ?? []) !== JSON.stringify(type.morphology.zones ?? [])) o.morphology = { ...o.morphology, zones: made.morphology.zones ?? [] }
  // its elements where they stand on it: its own when its type's, anchored on it, are not those
  return ownElements(type, o, made.elements)
}

/** A copy's hall's footprint as the new type makes it at the copy's place. */
function hallOf(type: WarehouseType, copy: { place: { x: number; y: number; angle: number }; overrides?: WarehouseOverrides }) {
  return copyParts(type, copy)[0]
}

/**
 * A project's warehouse types and copies brought to Decision "Block shape": each old type an outline, each copy at its
 * new column line A / 1 with its own outline where its parts differed, its masses one (its hall, remade; its parts'
 * masses and made level steps gone). A project with none: as it is.
 */
export function migrateWarehouses(p: Json): Json {
  const types = list(p.warehouseTypes)
  if (!types.some(isOldType)) return p
  const made = new Map<Id, { old: OldType; type: WarehouseType; shift: Point }>()
  const warehouseTypes = types.map((raw) => {
    if (!isOldType(raw)) return raw
    try {
      const r = typeFromOld(raw)
      made.set(r.type.id, { old: normal(raw), ...r })
      return r.type
    } catch {
      return raw
    }
  })
  const buildings = list(p.buildings)
  let masses = list(p.masses)
  const nextBuildings = buildings.map((b) => {
    const w = b.warehouse as { type: Id; place: { x: number; y: number; angle: number }; overrides?: OldOverrides } | undefined
    const m = w && made.get(w.type)
    if (!w || !m) return b
    const effective = typeFromOld(oldTypeWith(m.old, w.overrides) as unknown as Json)
    const overrides = diffOverrides(m.type, effective.type, w.overrides)
    const place = { ...onPlace(w.place, effective.shift), angle: w.place.angle }
    const copy = { type: w.type, place: { x: mm(place.x), y: mm(place.y), angle: place.angle }, ...(Object.keys(overrides).length ? { overrides } : {}) }
    // its masses: the hall remade, its parts gone
    const levels = new Set(list(b.levels).map((l) => l.id as Id))
    const mine = masses.filter((x) => levels.has(x.levelId as Id) && typeof x.part === 'string')
    const hall = mine.find((x) => x.part === 'hall')
    const gone = new Set(mine.filter((x) => x !== hall).map((x) => x.id as Id))
    if (hall) {
      const h = hallOf(m.type, copy)
      const groupShared = masses.some((x) => x !== hall && !gone.has(x.id as Id) && x.group === hall.group)
      const { group: _, holes: __, doorsAt: ___, ...rest } = hall
      const next: Json = {
        ...rest,
        name: `${b.name as string} · ${h.name}`,
        programId: h.programId,
        footprint: h.footprint as Footprint,
        height: h.height,
        docks: h.docks,
        ...(h.docks.length || h.doorsAt.length ? { doorsAt: h.doorsAt } : {}),
        ...(h.blockCourts.length ? { blockCourts: h.blockCourts } : {}),
        ...(h.holes.length ? { holes: h.holes } : {}),
        ...(h.zones.length ? { zones: h.zones } : {}),
        ...(hall.group && groupShared ? { group: hall.group } : {}),
        part: 'hall',
      }
      masses = masses.map((x) => (x === hall ? (next as Mass as unknown as Json) : x))
    }
    masses = masses.filter((x) => !gone.has(x.id as Id))
    const platform = isRecord(b.platform) ? { ...b.platform } : undefined
    if (platform && Array.isArray(platform.steps)) {
      const steps = list(platform.steps)
        .filter((s) => !String(s.id).startsWith(`${b.id as string}-level-`))
        .map((s) => ({ ...s, masses: (s.masses as Id[]).filter((id) => !gone.has(id)) }))
        .filter((s) => s.masses.length > 0)
      if (steps.length) platform.steps = steps
      else delete platform.steps
    }
    return { ...b, warehouse: copy, ...(platform ? { platform } : {}) }
  })
  return { ...p, warehouseTypes, buildings: nextBuildings, masses }
}

/**
 * A block's file of an older shape read into the new one: its type an outline (format 2, Decision "Block shape"), its
 * end bays under two thirds of a bay joined (format 3, Decision "Grid by line"), its elements by module (format 4,
 * Decision "Elements by module").
 */
export function migrateBlock(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  let b = raw
  if (b.formatVersion === undefined) b = { ...b, formatVersion: 2, type: isRecord(b.type) && isOldType(b.type) ? typeFromOld(b.type).type : b.type }
  if (b.formatVersion === 2) b = { ...b, formatVersion: 3, type: joinBlockEnds(b.type) }
  if (b.formatVersion === 3) {
    const r = OldElementsTypeSchema.safeParse(b.type)
    b = { ...b, formatVersion: 4, type: r.success ? typeByModule(r.data as OldElementsType) : b.type }
  }
  if (b.formatVersion === 4) {
    const r = LegacyTypeSchema.safeParse(b.type)
    b = { ...b, formatVersion: 5, type: r.success ? typeToMetres(r.data) : b.type }
  }
  // format 5 → 6 (Phase D.3): a truck court may have a shape and an id of its own; both optional, so only the version goes up
  if (b.formatVersion === 5) b = { ...b, formatVersion: 6 }
  return b
}

// ---- The free masses, blocks (Phase D.2 task 8): the second half of the step to version 17 is `massesToBlocks` (massesToBlocks.ts) ----
export { massesToBlocks } from './massesToBlocks.ts'

// ---- The outline in metres (Phase D.2: block format 5, project version 17) ----------------------------------------------------

/**
 * A type of block format 4 (and of a project of version 16) read into metres: its outline's corners the module lines' metres on the box
 * it stands on now (`moduleAt` of its runs; an outline drawn on another size read as the engine read it then, anchored to this one),
 * its holes contours, its zones as they were. Ids, walls and elements are kept: what it generates is what it generated.
 */
export function typeToMetres(t: WarehouseType): MetreType {
  const runs = hallRuns(t)
  const shape = shapeOf(t, runs)
  const outline = t.morphology.outline.length >= 4 ? linesToMetres(shape.outline, runs) : []
  const holes = shape.holes.map((h) => holeToMetres(h, runs))
  return { ...t, morphology: { outline, holes, ...(t.morphology.zones ? { zones: shape.zones } : {}) } }
}

/**
 * A copy's overrides read into metres (`typeToMetres` of the type they are on). One with an outline of its own is read whole as one
 * bundle on the box it is on now: its outline, holes, zones, elements and courts as it makes them, so what it generates is what it
 * generated. One without: its own holes in metres on the box they were drawn on (its type's outline's, else its own).
 */
export function overridesToMetres(t: WarehouseType, o: WarehouseOverrides | undefined): MetreOverrides | undefined {
  if (!o) return undefined
  const { morphology: given, ...rest } = o
  const m = given ?? {}
  const own = (m.outline?.length ?? 0) >= 4
  const c = typeWith(t, o)
  const runs = hallRuns(c)
  // a copy that lays its bays other than its type does, on a type with an outline or holes of its own: they stood on the copy's lines
  // (the module lines moved them), and in metres they would stay on the type's: it is read whole, as a copy with an outline of its own
  const laid = hallRuns({ ...t, hall: { ...t.hall, length: c.hall.length, width: c.hall.width } })
  const moves = !own && (t.morphology.outline.length >= 4 || t.morphology.holes.length > 0) && !sameRuns(runs, laid)
  if (!given && !moves) return o as MetreOverrides
  if (own || moves) {
    const shape = shapeOf(c, runs)
    const elements = elementsOn(c, runs, shape.edges)
    const courts = o.courts ?? (own ? (t.courts ?? []).filter((x) => m.outline!.some((k) => k.id === x.edge)) : (t.courts ?? []))
    const morphology = {
      ...(m.zones !== undefined || c.morphology.zones?.length ? { zones: shape.zones } : {}),
      outline: linesToMetres(shape.outline, runs),
      holes: shape.holes.map((h) => holeToMetres(h, runs)),
    }
    return { ...rest, morphology, elements, courts } as MetreOverrides
  }
  // the box its own holes were drawn on: the outline it has's (the type's box), else the copy's own (an empty outline of its own: the box now)
  const drawnOn = c.morphology.outline.length >= 4 ? hallRuns(t) : runs
  const morphology = {
    ...(m.outline !== undefined ? { outline: [] } : {}),
    ...(m.holes !== undefined ? { holes: m.holes.map((h) => holeToMetres(h, drawnOn)) } : {}),
    ...(m.zones !== undefined ? { zones: m.zones } : {}),
  }
  return { ...rest, morphology } as MetreOverrides
}

/**
 * A project's warehouse types and copies read from module lines into metres (version 16 → 17, the first half): each type
 * (`typeToMetres`), each copy's overrides (`overridesToMetres`). What it does not read as a block of version 16 stays as it is.
 */
export function blocksToMetres(p: Json): Json {
  const types = list(p.warehouseTypes)
  if (!types.length) return p
  const old = new Map<Id, WarehouseType>()
  const warehouseTypes = types.map((raw) => {
    const r = LegacyTypeSchema.safeParse(raw)
    if (!r.success) return raw
    old.set(r.data.id, r.data)
    return typeToMetres(r.data) as unknown as Json
  })
  const buildings = list(p.buildings).map((b) => {
    const w = b.warehouse as { type: Id; overrides?: unknown } | undefined
    const t = w && old.get(w.type)
    if (!w || !t || w.overrides === undefined) return b
    const r = LegacyOverridesSchema.safeParse(w.overrides)
    if (!r.success) return b
    const overrides = overridesToMetres(t, r.data)
    return { ...b, warehouse: { ...w, overrides } }
  })
  return { ...p, warehouseTypes, buildings }
}

// ---- Short end bays joined (Decision "Grid by line", GR.1) ----------------------------------------------------------

const sameRuns = (a: HallRuns, b: HallRuns) => JSON.stringify([a.x.lines, a.y.lines]) === JSON.stringify([b.x.lines, b.y.lines])

/**
 * The rules listed by bay on a type's edges, from the bays of `before` to those of `after`: each listed bay's middle
 * falls in one bay now (two end bays joined: one). A rule of every n bays, an element by module (a join keeps the
 * modules), or an edge it no longer has: as it is.
 */
function keepListed(elements: (HallElement | LegacyElement)[], t: Pick<WarehouseType, 'morphology' | 'envelope'>, before: HallRuns, after: HallRuns): (HallElement | LegacyElement)[] {
  if (sameRuns(before, after)) return elements
  const was = shapeOf(t, before).edges
  const now = shapeOf(t, after).edges
  return elements.map((el) => {
    if (!isLegacy(el) || !Array.isArray(el.bays)) return el
    const a = was.find((e) => e.id === el.edge)
    const b = now.find((e) => e.id === el.edge)
    if (!a || !b) return el
    const to = edgeBays(after, b)
    const mids = pickedBays(edgeBays(before, a), el.bays).map((x) => (x.lo + x.hi) / 2)
    const bays = [...new Set(mids.map((m) => to.findIndex((x) => m >= x.lo - ON && m <= x.hi + ON)).filter((i) => i >= 0))].sort((i, j) => i - j)
    return bays.length && JSON.stringify(bays) !== JSON.stringify(el.bays) ? { ...el, bays } : el
  })
}

/** A type laid again under the join rule of two thirds of a bay from `was` (an older file's). */
function rejoined(t: OldElementsType, was: JoinRule): OldElementsType {
  const { joinUnder: _, ...hall } = t.hall
  const made: OldElementsType = { ...t, hall }
  const elements = keepListed(t.elements, t, hallRuns(t, was), hallRuns(made))
  return elements === t.elements ? made : { ...made, elements }
}

/** A copy's own elements laid again with its type (`before` the rule changed, `after`). */
function rejoinedOverrides(before: OldElementsType, after: OldElementsType, o: OldElementsOverrides | undefined, was: JoinRule): OldElementsOverrides | undefined {
  if (!o?.elements) return o
  const a = oldElementsWith(before, o)
  const b = oldElementsWith(after, o)
  const elements = keepListed(o.elements, a, hallRuns(a, was), hallRuns(b))
  return elements === o.elements ? o : { ...o, elements }
}

/**
 * A project of version 11 under the rule of version 12 (Decision "Grid by line"): each block without its own rule
 * laid again (its end bays under two thirds of a bay joined), what was listed by bay where it stood, its copies' own
 * elements too, and their masses made again (their walls' docks and doors where the block has them now).
 */
export function joinShortEnds(p: Json): Json {
  // each block read under the rule it had (half a bay) and the one it has now
  const types = new Map<Id, { before: OldElementsType; after: OldElementsType }>()
  let any = false
  const warehouseTypes = list(p.warehouseTypes).map((raw) => {
    const r = OldElementsTypeSchema.safeParse(raw)
    if (!r.success || r.data.hall.joinUnder !== undefined) return raw
    const t = r.data as OldElementsType
    if (sameRuns(hallRuns(t, halfBays(t.grid)), hallRuns(t))) {
      types.set(t.id, { before: t, after: t })
      return raw
    }
    const after = rejoined(t, halfBays(t.grid))
    types.set(t.id, { before: t, after })
    any = true
    return after as unknown as Json
  })
  let masses = list(p.masses)
  const buildings = list(p.buildings).map((b) => {
    const w = b.warehouse as { type: Id; place: { x: number; y: number; angle: number }; overrides?: OldElementsOverrides } | undefined
    const c = w && types.get(w.type)
    if (!w || !c) return b
    let copy = w
    try {
      // a copy of its own size may join where its block does not
      const own = oldElementsWith(c.before, w.overrides)
      if (c.after === c.before && sameRuns(hallRuns(own, halfBays(own.grid)), hallRuns(own))) return b
      any = true
      // where it stands now (a hall moved by hand since it was made: its place as old as its last remake)
      const at = { ...w, place: standing(c.before, w, b, masses) }
      const overrides = rejoinedOverrides(c.before, c.after, w.overrides, halfBays(own.grid))
      copy = overrides === w.overrides ? at : { ...at, overrides }
      // its masses (each by its part, on its levels) where the block makes them now, its elements by module
      masses = remadeMasses(masses, b, typeByModule(oldElementsWith(c.after, copy.overrides)), { place: copy.place })
    } catch {
      // a copy the engine cannot make keeps its masses as they were
    }
    return copy === w ? b : { ...b, warehouse: copy }
  })
  return any ? { ...p, warehouseTypes, buildings, masses } : p
}

/** A block's type of format 2 under the rule of format 3 (`joinShortEnds`, the type alone). */
export function joinBlockEnds(raw: unknown): unknown {
  const r = OldElementsTypeSchema.safeParse(raw)
  if (!r.success || r.data.hall.joinUnder !== undefined) return raw
  return rejoined(r.data as OldElementsType, halfBays(r.data.grid))
}
