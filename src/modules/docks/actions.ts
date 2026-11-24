// Dock doors on the structural grid (Decision "Structural grid", Phase G.3). Pure, like the rest: nothing changed → the
// same project.
//   setProgramPattern  a program's door pattern (the default of its masses); null: the default (one every module)
//   setDoorPattern     a mass's own pattern; null: its program's again
//   flipDoor           a module of a docked wall: its door, if the pattern gives one, taken away; else one added (an
//                      exception, kept by the wall's middle and the module's index from the wall's start); again: undone
//   clearDoorFlips     a mass's exceptions dropped
//   setCourtDepth      a docked wall's own truck court depth (Decision "Truck court": the pill on the court's outer
//                      edge); null: its block's or the standards' again
import { DockPatternSchema, type DockPattern, type Id, type Mass, type Project } from '../../model/schema.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { edgeAt } from '../../engine/geom/perimeter.ts'
import { COURT_DEPTH_MAX, COURT_DEPTH_MIN, SHAPED_COURT } from './engine/docks.ts'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function withMass(p: Project, id: Id, f: (m: Mass) => Mass): Project {
  const m = p.masses.find((x) => x.id === id)
  if (!m) return p
  const next = f(m)
  return same(next, m) ? p : { ...p, masses: p.masses.map((x) => (x.id === id ? next : x)) }
}

export function setProgramPattern(p: Project, programId: Id, pattern: DockPattern | null): Project {
  const g = p.programs.find((x) => x.id === programId)
  if (!g?.docks || (pattern && !DockPatternSchema.safeParse(pattern).success)) return p
  const { pattern: _, ...docks } = g.docks
  const next = pattern ? { ...docks, pattern } : docks
  if (same(next, g.docks)) return p
  return { ...p, programs: p.programs.map((x) => (x.id === programId ? { ...x, docks: next } : x)) }
}

export function setDoorPattern(p: Project, massId: Id, pattern: DockPattern | null): Project {
  if (pattern && !DockPatternSchema.safeParse(pattern).success) return p
  return withMass(p, massId, (m) => {
    const { doorPattern: _, ...rest } = m
    return pattern ? { ...rest, doorPattern: pattern } : rest
  })
}

export function flipDoor(p: Project, massId: Id, t: number, module: number): Project {
  if (!Number.isInteger(module) || module < 0 || !(t >= 0 && t <= 1)) return p
  return withMass(p, massId, (m) => {
    const poly = footprintPolygon(m.footprint)
    const wall = edgeAt(poly, t).i
    const flips = m.doorFlips ?? []
    const here = (f: { t: number; module: number }) => f.module === module && edgeAt(poly, f.t).i === wall
    const next = flips.some(here) ? flips.filter((f) => !here(f)) : [...flips, { t, module }]
    const { doorFlips: _, ...rest } = m
    return next.length ? { ...rest, doorFlips: next } : rest
  })
}

export function clearDoorFlips(p: Project, massId: Id): Project {
  return withMass(p, massId, (m) => {
    const { doorFlips: _, ...rest } = m
    return rest
  })
}

/** Why a wall's own depth cannot be set (`SHAPED_COURT`); undefined: it can. */
export function courtDepthRefusal(p: Project, massId: Id, t: number): string | undefined {
  const m = p.masses.find((x) => x.id === massId)
  if (!m?.blockCourts?.some((c) => c.shape)) return undefined
  const poly = footprintPolygon(m.footprint)
  const wall = edgeAt(poly, t).i
  return m.blockCourts.some((c) => c.shape && edgeAt(poly, c.t).i === wall) ? SHAPED_COURT : undefined
}

export function setCourtDepth(p: Project, massId: Id, t: number, depth: number | null): Project {
  if (!(t >= 0 && t <= 1) || (depth !== null && !(Number.isFinite(depth) && depth > 0))) return p
  if (depth !== null && courtDepthRefusal(p, massId, t)) return p
  return withMass(p, massId, (m) => {
    const poly = footprintPolygon(m.footprint)
    const wall = edgeAt(poly, t).i
    const rest = (m.courts ?? []).filter((c) => edgeAt(poly, c.t).i !== wall)
    const mm = depth === null ? null : Math.round(Math.min(COURT_DEPTH_MAX, Math.max(COURT_DEPTH_MIN, depth)) * 100) / 100
    const next = mm === null ? rest : [...rest, { t, depth: mm }]
    const { courts: _, ...others } = m
    return next.length ? { ...others, courts: next } : others
  })
}
