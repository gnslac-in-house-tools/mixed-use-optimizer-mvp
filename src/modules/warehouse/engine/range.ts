// A block past its range by hand (Decision "Past the range by hand", RB.1), pure: a copy's length or width (step 2's,
// or its own, its walls dragged or typed) outside its block's range (as set; without one, what the optimizer searches,
// `hallLimits`: two bays either way) is not held back; it is an Issue, a warning, so it is seen. engine/derive.ts lists them.
import type { Id, Project } from '../../../model/schema.ts'
import type { Issue } from '../../../engine/types.ts'
import { hallLimits, typeWith } from './generate.ts'

/** m: a length this close to a limit is on it. */
const ON = 0.005

const m = (v: number) => (Math.round(v * 100) / 100).toLocaleString('en-US')

/** A side past its range: its length or width now, the range as the block sets it (m), and where the optimizer's search
 *  ends on the block's modules inside it (`to`: the nearer of the two, where it is brought back). */
export interface PastSide {
  key: 'length' | 'width'
  now: number
  lo: number
  hi: number
  to: number
}

/**
 * A copy's sides past its block's range (as the block sets it; without one, `bays` either way of its size, as the
 * optimizer's variable searches: two by default).
 */
export function pastRange(p: Project, buildingId: Id, bays = 2): PastSide[] {
  const b = p.buildings.find((x) => x.id === buildingId)
  const t = b?.warehouse && p.warehouseTypes?.find((x) => x.id === b.warehouse!.type)
  if (!b?.warehouse || !t) return []
  const made = typeWith(t, b.warehouse.overrides)
  return (['length', 'width'] as const).flatMap((key) => {
    // the range as the block sets it; without one, what the optimizer searches (`bays` either way of its size)
    const search = hallLimits(t, key, bays)
    const [lo, hi] = t.hall.range?.[key] ?? [search.lo, search.hi]
    const now = made.hall[key]
    return now < lo - ON || now > hi + ON ? [{ key, now, lo, hi, to: now < lo ? search.lo : search.hi }] : []
  })
}

/** A side past its range in words: "250 m long, its range 200–230 m". */
export const pastInWords = (x: PastSide) => `${m(x.now)} m ${x.key === 'length' ? 'long' : 'wide'}, its range ${m(x.lo)}–${m(x.hi)} m`

/** *Past its range*: one warning for each copy an option shows whose box is past its block's range, on its masses. */
export function rangeIssues(p: Project, buildingIds: Id[]): Issue[] {
  return buildingIds.flatMap((id) => {
    const past = pastRange(p, id)
    if (!past.length) return []
    const b = p.buildings.find((x) => x.id === id)!
    const levels = new Set(b.levels.map((l) => l.id))
    const massIds = p.masses.filter((x) => levels.has(x.levelId) && x.part !== undefined).map((x) => x.id)
    const says = past.map(pastInWords).join('; ')
    return [{ code: 'range' as const, severity: 'warning' as const, massIds, message: `${b.name} is past its range by hand: ${says}. The optimizer brings it back.` }]
  })
}
