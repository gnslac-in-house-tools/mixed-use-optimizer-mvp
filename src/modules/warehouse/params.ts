// The warehouse types' kinds of *What may change* (Decisions "Warehouse type", "Smart blocks" and "Catalog"; what every
// kind shares: modules/vary.ts): on the type's copies in the option, their variants; the type stays the designer's.
//   warehouse.hall    each copy's own box (B.4, Decision "Block shape": the outline's bounding box): its length and
//                     width as a variant may take them by hand (B.2, `hallLimits`: whole modules from the block's
//                     size, within its range, else ±range bays), into that copy's overrides (setWarehouseOverrides:
//                     remade where it stands, column line A / 1 kept); the shape's inner walls keep their distance
//                     from the nearer outer wall
//   court.depth       each copy's truck courts (ST.8, Decision "Truck court"): their depth within its block's range
//                     (WarehouseType.court; a block without one, none), as its docked walls' own (setCourtDepth); a wall whose
//                     courts have a shape of their own (Phase D.3) is the designer's, left alone as its docks are
// Each reads the types and their copies once per problem (`prepare`, through `warehousesOf`).
import { hallLimits, typeWith } from './engine/generate.ts'
import type { Building, DesignOption, Id, Mass, Project, WarehouseOverrides, WarehouseType } from '../../model/schema.ts'
import { setWarehouseOverrides } from './actions.ts'
import { setCourtDepth } from '../docks/actions.ts'
import { HALL_RANGE, type ParamKind, type Variable } from '../vary.ts'

/** A copy as the problem found it: its building's id and name, its variant. */
type Copy = { id: Id; name: string; overrides?: WarehouseOverrides }
/** Each warehouse type with copies among the option's design buildings, as it was, and those copies. */
type Warehouses = { type: WarehouseType; copies: Copy[] }[]

/** The option's warehouse types with copies: a copy with its hall (one without is a copy no more: Decision "A copy
 *  without its hall"). */
function warehousesOf(p: Project, option: DesignOption): Warehouses {
  const hasHall = (b: Building) => p.masses.some((m) => m.part === 'hall' && b.levels.some((l) => l.id === m.levelId))
  const copies = option.buildingIds.flatMap((id) => p.buildings.filter((b) => b.id === id && !b.context && b.warehouse && hasHall(b)))
  return (p.warehouseTypes ?? []).flatMap((type) => {
    const of = copies.filter((b) => b.warehouse!.type === type.id).map((b): Copy => ({ id: b.id, name: b.name, overrides: b.warehouse!.overrides }))
    return of.length ? [{ type, copies: of }] : []
  })
}

/** A copy's overrides as they are now, and its type with them. */
function copyNow(p: Project, id: Id) {
  const b = p.buildings.find((x) => x.id === id)
  const t = b?.warehouse && p.warehouseTypes?.find((x) => x.id === b.warehouse!.type)
  return b?.warehouse && t ? { o: b.warehouse.overrides ?? {}, t: typeWith(t, b.warehouse.overrides) } : null
}

const SIZES = ['length', 'width'] as const

const warehouseHall: ParamKind<Warehouses> = {
  id: 'warehouse.hall',
  module: 'warehouse',
  order: 10,
  rank: 0,
  area: 'massing',
  role: 'masses',
  label: 'Warehouse box',
  help: 'Each copy’s box, its length and width, in whole modules from its block’s size: within its Box step’s range, else ± so many bays; its inner walls keep their distance from the nearer outer wall; the block itself stays',
  fields: 'hall',
  hint: 'bays',
  unit: 'm',
  step: 1,
  range: HALL_RANGE,
  prepare: (p, ctx) => warehousesOf(p, ctx.option),
  variables(_ctx, { step, range }, warehouses) {
    return warehouses.flatMap(({ type: t, copies }) =>
      copies.flatMap((c) =>
        SIZES.map((k): Variable => {
          const { module, lo, hi } = hallLimits(t, k, range)
          return {
            key: `${c.id}.${k}`,
            kind: 'warehouse.hall',
            target: c.id,
            label: `${c.name} · ${k}`,
            gene: { kind: 'real', min: lo, max: hi, step: module * Math.max(1, Math.round(step)) },
            read: (p) => copyNow(p, c.id)?.t.hall[k] ?? t.hall[k],
          }
        }),
      ),
    )
  },
  write(p, values, _ctx, warehouses) {
    let q = p
    for (const { type: t, copies } of warehouses)
      for (const c of copies) {
        if (!SIZES.some((k) => values.has(`${c.id}.${k}`))) continue
        const now = copyNow(q, c.id)
        if (!now) continue
        // what equals the block's size is no change
        const hall = { ...now.o.hall }
        for (const k of SIZES) {
          const v = values.get(`${c.id}.${k}`) ?? hall[k]
          if (v === undefined || Math.abs(v - t.hall[k]) < 1e-6) delete hall[k]
          else hall[k] = v
        }
        const { hall: _, ...rest } = now.o
        q = setWarehouseOverrides(q, c.id, Object.keys(hall).length ? { ...rest, hall } : rest)
      }
    return q
  },
}

/** A copy's hall: its mass, made by the type (its docked walls' t in `docks`). */
const hallOf = (p: Project, id: Id) => {
  const b = p.buildings.find((x) => x.id === id)
  return b ? p.masses.find((m) => m.part === 'hall' && b.levels.some((l) => l.id === m.levelId)) : undefined
}

/**
 * Whether a docked wall of a copy's hall (`t`, the middle's t) has courts with a shape of their own (Phase D.3, Decision "Courts in the circulation"):
 * its depth is the designer's, as its docks are, and the optimizer leaves it.
 */
const shapedAt = (hall: Mass, t: number): boolean => (hall.blockCourts ?? []).some((c) => c.shape && Math.abs(c.t - t) < 1e-9)

const courtDepth: ParamKind<Warehouses> = {
  id: 'court.depth',
  module: 'warehouse',
  order: 15,
  rank: 0.5,
  area: 'massing',
  role: 'masses',
  label: 'Court depth',
  help: 'Each copy’s truck courts, as deep as its block’s range lets them (the block’s docks step: Truck court, from … to); the block itself stays',
  fields: 'step',
  hint: 'm',
  unit: 'm',
  step: 1,
  // a copy whose docked walls all have shaped courts has nothing to vary: a wall with some is left alone, the copy's others still vary
  prepare: (p, ctx) =>
    warehousesOf(p, ctx.option)
      .map((w) => ({
        ...w,
        copies: w.copies.filter((c) => {
          const hall = hallOf(p, c.id)
          return !hall?.docks?.length || hall.docks.some((t) => !shapedAt(hall, t))
        }),
      }))
      .filter((w) => w.copies.length > 0),
  variables(_ctx, { step }, warehouses) {
    return warehouses.flatMap(({ type: t, copies }) => {
      const r = t.court?.range
      if (!t.court || !r || r[1] <= r[0]) return []
      return copies.map(
        (c): Variable => ({
          key: `${c.id}.court`,
          kind: 'court.depth',
          target: c.id,
          label: `${c.name} · court depth`,
          gene: { kind: 'real', min: r[0], max: r[1], step },
          read: (p) => hallOf(p, c.id)?.courts?.[0]?.depth ?? t.court!.depth,
        }),
      )
    })
  },
  write(p, values, _ctx, warehouses) {
    let q = p
    for (const { copies } of warehouses)
      for (const c of copies) {
        const v = values.get(`${c.id}.court`)
        const hall = hallOf(q, c.id)
        if (v === undefined || !hall) continue
        for (const t of hall.docks ?? []) if (!shapedAt(hall, t)) q = setCourtDepth(q, hall.id, t, v)
      }
    return q
  },
}

export const WAREHOUSE_PARAMS: ParamKind[] = [warehouseHall, courtDepth]
