// The terrain's kind of *What may change* (Decisions "Platforms" and "Catalog"; what every kind shares: modules/vary.ts):
//   platform.level    a design platform's level (a building's, buildings joined, a step), ±range m around its balanced
//                     level as the problem found it, on whole steps (0.5 m by default, the designer's), typed through
//                     setPlatformLevel or setStepLevel; with no ground, none
// Its platforms are read once per problem (`prepare`), only when a template varies them: it derives the option's masses.
import { deriveMassing } from '../../engine/derive.ts'
import { platformRoot } from './engine/platforms.ts'
import type { DesignOption, Id, Project } from '../../model/schema.ts'
import { buildingLocked } from '../../model/locks.ts'
import { setPlatformLevel, setStepLevel } from './actions.ts'
import { PLATFORM_RANGE, type ParamKind, type Variable } from '../vary.ts'

/** A design platform on the ground: a building's or a step's, its balanced level. */
interface Platform {
  id: Id
  step: boolean
  name: string
  balanced: number
}

/**
 * The option's design platforms on the ground (none without a terrain), but those of a locked building: a locked building keeps its
 * platform and its steps, so the level they stand at is not a variable (the building that holds the level, or any that stands on it).
 */
function platformsOf(p: Project, option: DesignOption): Platform[] {
  const earthwork = p.site.terrain ? deriveMassing(p, option.id).options[option.id]?.earthwork : null
  const massName = (id: Id) => p.masses.find((m) => m.id === id)?.name ?? id
  const held = (x: { id: Id; step: boolean; buildingIds: Id[] }) =>
    x.buildingIds.some((id) => buildingLocked(p, id)) || p.buildings.some((b) => b.locked === true && (x.step ? b.platform?.steps?.some((s) => s.id === x.id) : b.id === platformRoot(p, x.id)))
  return (earthwork?.platforms ?? []).flatMap((x) =>
    x.context || x.balanced === null || held(x)
      ? []
      : [{ id: x.id, step: x.step, balanced: x.balanced, name: x.step ? x.massIds.map(massName).join(', ') : x.buildingIds.map((id) => p.buildings.find((b) => b.id === id)?.name ?? id).join(' + ') }],
  )
}

/** A platform's typed level in a project, if it has one. */
function typedLevel(p: Project, x: { id: Id; step: boolean }): number | undefined {
  if (x.step) return p.buildings.flatMap((b) => b.platform?.steps ?? []).find((s) => s.id === x.id)?.level
  return p.buildings.find((b) => b.id === platformRoot(p, x.id))?.platform?.level
}

const platform: ParamKind<Platform[]> = {
  id: 'platform.level',
  module: 'terrain',
  order: 130,
  rank: 7,
  area: 'site',
  label: 'Platform levels',
  help: 'Each platform’s level, ± its range around its balanced level, on whole steps (with ground)',
  fields: 'range-step',
  hint: 'm',
  unit: 'm',
  step: 0.5,
  range: PLATFORM_RANGE,
  prepare: (p, ctx) => platformsOf(p, ctx.option),
  variables(_ctx, { step, range }, platforms) {
    return platforms.map((x): Variable => {
      // on whole steps: a level the designer would type
      const min = Math.floor((x.balanced - range) / step) * step
      const max = Math.ceil((x.balanced + range) / step) * step
      return {
        key: `${x.id}.level`,
        kind: 'platform.level',
        target: x.id,
        label: `${x.name} · platform level`,
        gene: { kind: 'real', min, max, step },
        read: (p) => typedLevel(p, x) ?? x.balanced,
      }
    })
  },
  write(p, values, _ctx, platforms) {
    return platforms.reduce((q, x) => {
      const v = values.get(`${x.id}.level`)
      return v === undefined ? q : x.step ? setStepLevel(q, x.id, v) : setPlatformLevel(q, x.id, v)
    }, p)
  },
}

export const TERRAIN_PARAMS: ParamKind[] = [platform]
