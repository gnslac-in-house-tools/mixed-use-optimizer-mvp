// Platform actions (Decisions "Terrain", "Platforms"). Pure, like the rest: nothing changed → the same project. A
// building stands on its own platform at the balanced level unless it says otherwise (Building.platform):
//   setPlatformLevel  the level typed, or back to balanced (null), on the platform it stands on (joined: the shared one)
//   joinPlatform      a building onto another's platform, with those that stood on its own
//   ownPlatform       a building off a shared platform: its own again (the others stay together)
//   stepMasses        masses onto a platform of their own in their building (a step), out of any other step
//   unstepMasses      masses back onto their building's platform
//   setStepLevel · removeStep
//   balanceWithBanks  the level typed that balances its cut and fill with its banks (Decision "Balance with banks")
import type { Building, Id, Platform, Project, Step } from '../../model/schema.ts'
import { buildingOf, optionOf } from '../../engine/buildings.ts'
import { deriveMassing } from '../../engine/derive.ts'
import { bankBalancedLevel, platformRoot } from './engine/platforms.ts'
import { surfaceOf } from './engine/surface.ts'
import { newId } from '../../state/actions/masses.ts'

/** The platform without what is empty; absent when nothing is left. */
function tidy(pl: Platform): Platform | undefined {
  const out: Platform = {}
  if (pl.level !== undefined) out.level = pl.level
  if (pl.joined !== undefined) out.joined = pl.joined
  const steps = pl.steps?.filter((s) => s.masses.length > 0)
  if (steps?.length) out.steps = steps
  return Object.keys(out).length ? out : undefined
}

/** The building with its platform changed by `f` (tidied). */
function withPlatform(b: Building, f: (pl: Platform) => Platform): Building {
  const { platform, ...rest } = b
  const next = tidy(f(platform ?? {}))
  return next ? { ...rest, platform: next } : rest
}

/** The buildings whose platform `f` changes, changed; the same project when none does. */
function mapBuildings(p: Project, f: (b: Building) => Building): Project {
  let changed = false
  const buildings = p.buildings.map((b) => {
    const next = f(b)
    if (JSON.stringify(next.platform) === JSON.stringify(b.platform)) return b
    changed = true
    return next
  })
  return changed ? { ...p, buildings } : p
}

/** The level of the platform a building stands on, typed (m), or balanced again (null). */
export function setPlatformLevel(p: Project, buildingId: Id, level: number | null): Project {
  if (!p.buildings.some((b) => b.id === buildingId) || (level !== null && !Number.isFinite(level))) return p
  const root = platformRoot(p, buildingId)
  return mapBuildings(p, (b) =>
    b.id !== root
      ? b
      : withPlatform(b, (pl) => {
          const { level: _l, ...rest } = pl
          return level === null ? rest : { ...rest, level }
        }),
  )
}

/**
 * `buildingId` stands on `withId`'s platform (the one that one stands on), and so do the buildings that stood on its
 * own; its typed level gives way to the shared one's. A context building joins none.
 */
export function joinPlatform(p: Project, buildingId: Id, withId: Id): Project {
  const a = p.buildings.find((b) => b.id === buildingId)
  const other = p.buildings.find((b) => b.id === withId)
  if (!a || !other || a.context || other.context) return p
  const root = platformRoot(p, withId)
  if (platformRoot(p, buildingId) === root) return p
  return mapBuildings(p, (b) => {
    if (b.id === buildingId)
      return withPlatform(b, (pl) => {
        const { level: _l, ...rest } = pl
        return { ...rest, joined: root }
      })
    return b.platform?.joined === buildingId ? withPlatform(b, (pl) => ({ ...pl, joined: root })) : b
  })
}

/**
 * The building on a platform of its own again. Joined to another: it leaves. The one the others joined: they stay
 * together on the first of them, which keeps the shared platform's typed level.
 */
export function ownPlatform(p: Project, buildingId: Id): Project {
  const a = p.buildings.find((b) => b.id === buildingId)
  if (!a) return p
  if (a.platform?.joined !== undefined) return mapBuildings(p, (b) => (b.id === buildingId ? withPlatform(b, ({ joined: _j, ...rest }) => rest) : b))
  const members = p.buildings.filter((b) => b.id !== buildingId && b.platform?.joined === buildingId)
  if (members.length === 0) return p
  const next = members[0].id
  const level = a.platform?.level
  return mapBuildings(p, (b) => {
    if (b.id === next)
      return withPlatform(b, ({ joined: _j, level: _l, ...rest }) => (level === undefined ? rest : { ...rest, level }))
    return b.platform?.joined === buildingId ? withPlatform(b, (pl) => ({ ...pl, joined: next })) : b
  })
}

/** The steps without these masses (a step left empty goes). */
const without = (steps: Step[] | undefined, ids: Set<Id>) => steps?.map((s) => ({ ...s, masses: s.masses.filter((m) => !ids.has(m)) }))

/**
 * The masses on a platform of their own in their building (a step), balanced: one step for those of each building,
 * taken out of any step they were in. Returns the new steps' ids.
 */
export function stepMasses(p: Project, massIds: Id[]): { project: Project; ids: Id[] } {
  const byBuilding = new Map<Id, Id[]>()
  for (const id of massIds) {
    const m = p.masses.find((x) => x.id === id)
    if (!m) continue
    const b = buildingOf(p, m)
    if (b.context) continue
    byBuilding.set(b.id, [...(byBuilding.get(b.id) ?? []), id])
  }
  if (byBuilding.size === 0) return { project: p, ids: [] }
  const taken = p.buildings.flatMap((b) => b.platform?.steps?.map((s) => s.id) ?? [])
  const ids: Id[] = []
  const all = new Set([...byBuilding.values()].flat())
  const project = mapBuildings(p, (b) => {
    const own = byBuilding.get(b.id)
    const kept = without(b.platform?.steps, all)
    if (!own) return withPlatform(b, (pl) => ({ ...pl, steps: kept }))
    const id = newId('s', [...taken, ...ids])
    ids.push(id)
    return withPlatform(b, (pl) => ({ ...pl, steps: [...(kept ?? []), { id, masses: own }] }))
  })
  return { project, ids }
}

/** The masses back on their building's platform: out of their steps (a step left empty goes). */
export function unstepMasses(p: Project, massIds: Id[]): Project {
  const ids = new Set(massIds)
  return mapBuildings(p, (b) => (b.platform?.steps?.some((s) => s.masses.some((m) => ids.has(m))) ? withPlatform(b, (pl) => ({ ...pl, steps: without(pl.steps, ids) })) : b))
}

/** A step's level typed (m), or balanced again (null). */
export function setStepLevel(p: Project, stepId: Id, level: number | null): Project {
  if (level !== null && !Number.isFinite(level)) return p
  return mapBuildings(p, (b) =>
    b.platform?.steps?.some((s) => s.id === stepId)
      ? withPlatform(b, (pl) => ({
          ...pl,
          steps: pl.steps!.map((s) => {
            if (s.id !== stepId) return s
            const { level: _l, ...rest } = s
            return level === null ? rest : { ...rest, level }
          }),
        }))
      : b,
  )
}

/** A step undone: its masses back on their building's platform. */
export function removeStep(p: Project, stepId: Id): Project {
  return mapBuildings(p, (b) => (b.platform?.steps?.some((s) => s.id === stepId) ? withPlatform(b, (pl) => ({ ...pl, steps: pl.steps!.filter((s) => s.id !== stepId) })) : b))
}

/**
 * Platform `id` (a building's, by any building on it, or a step) typed at the level that balances its cut and fill with
 * its banks, in option `optionId` (Decision "Balance with banks"): the balanced level is its masses' and courts' alone,
 * so its banks' earth is left over. Nothing to balance (no ground, none under it): the same project.
 */
export function balanceWithBanks(p: Project, id: Id, optionId: Id): Project {
  if (!p.site.terrain) return p
  const step = p.buildings.some((b) => b.platform?.steps?.some((s) => s.id === id))
  const target = step ? id : platformRoot(p, id)
  const m = deriveMassing(p, optionId)
  const o = optionOf(p, optionId)
  const shown = Object.values(m.masses).filter((x) => o.buildingIds.includes(x.buildingId))
  const docks = m.options[o.id]?.docks.docks ?? []
  const level = bankBalancedLevel(p, surfaceOf(p.site.terrain), shown, docks, m.site.polygon, target)
  if (level === null) return p
  return step ? setStepLevel(p, id, level) : setPlatformLevel(p, id, level)
}
