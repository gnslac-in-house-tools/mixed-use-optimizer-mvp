// A block written back onto its module lines, for the tests of the old steps (Phase D.2): those steps run on the frozen
// module-line engine (legacy/) and read a file as block format 4 and project version 16 wrote it. A live type, its outline
// and holes in metres, is turned into what such a file held (an outline off the module lines is dropped to the box).
import type { Project, WarehouseOverrides, WarehouseType } from '../../../../model/schema.ts'
import { hallRuns, typeWith } from '../generate.ts'
import type { LegacyOverrides, LegacyType } from '../legacy/types.ts'
import { cornersOnLinesOf, drawn, holeOnLines } from '../shape.ts'

const holesOnLines = (holes: WarehouseType['morphology']['holes'], runs: ReturnType<typeof hallRuns>) =>
  holes.flatMap((h) => {
    const l = holeOnLines(h, runs)
    return l ? [{ id: l.id, x: l.x, y: l.y }] : []
  })

/** A type as block format 4 held it. */
export function inLines(t: WarehouseType): LegacyType {
  const runs = hallRuns(t)
  const outline = drawn(t.morphology.outline) ? (cornersOnLinesOf(t.morphology.outline, runs) ?? []) : []
  return { ...t, morphology: { outline, holes: holesOnLines(t.morphology.holes, runs), ...(t.morphology.zones ? { zones: t.morphology.zones } : {}) } }
}

/** A copy's overrides as version 16 held them (its own outline on the box it is on now). */
export function overridesInLines(t: WarehouseType, o: WarehouseOverrides | undefined): LegacyOverrides | undefined {
  if (!o?.morphology) return o as LegacyOverrides | undefined
  const { morphology: m, ...rest } = o
  const runs = hallRuns(typeWith(t, o))
  const on = drawn(m.outline) || !drawn(t.morphology.outline) ? runs : hallRuns(t)
  return {
    ...rest,
    morphology: {
      ...(m.outline ? { outline: drawn(m.outline) ? (cornersOnLinesOf(m.outline, runs) ?? []) : [] } : {}),
      ...(m.holes ? { holes: holesOnLines(m.holes, on) } : {}),
      ...(m.zones ? { zones: m.zones } : {}),
    },
  }
}

/** A project as version 16 held it: its types and its copies' overrides on module lines. */
export function projectInLines(p: Project): Project {
  const types = p.warehouseTypes
  if (!types) return p
  const buildings = p.buildings.map((b) => {
    const t = b.warehouse && types.find((x) => x.id === b.warehouse!.type)
    return t && b.warehouse?.overrides ? { ...b, warehouse: { ...b.warehouse, overrides: overridesInLines(t, b.warehouse.overrides) } } : b
  })
  return { ...p, warehouseTypes: types.map(inLines) as unknown as WarehouseType[], buildings: buildings as unknown as Project['buildings'] }
}
