// The docks' kind of *What may change* (Decisions "Structural grid" and "Catalog"; what every kind shares:
// modules/vary.ts):
//   dock.pattern      on the grid, each docking program's doors: a door every 1 to range modules, from which, into its
//                     masses' own patterns (setDoorPattern), never door by door
// Its docking programs are read once per problem (`prepare`): each one's design masses in the option.
import { buildingOf, massesOfOption } from '../../engine/buildings.ts'
import { DEFAULT_PATTERN } from './engine/docks.ts'
import type { DesignOption, DockPattern, Grid, Id, Project } from '../../model/schema.ts'
import { setDoorPattern } from './actions.ts'
import { MOST_EVERY, type ParamKind, type Variable } from '../vary.ts'

/** A docking program of the option's design masses, and those masses. */
interface Docking {
  programId: Id
  name: string
  masses: Id[]
}

/** On the grid, each docking program of the option's design masses (none off the grid). */
function patternsOf(p: Project, option: DesignOption, grid: Grid | null): Docking[] {
  const docking = grid ? p.programs.filter((g) => g.docks) : []
  const design = massesOfOption(p, option).filter((m) => !buildingOf(p, m).context)
  return docking.flatMap((g) => {
    const of = design.filter((m) => m.programId === g.id).map((m) => m.id)
    return of.length ? [{ programId: g.id, name: g.name, masses: of }] : []
  })
}

/** A mass's pattern now: its own, its program's, the default. */
function patternOf(p: Project, id: Id): DockPattern {
  const m = p.masses.find((x) => x.id === id)
  const program = p.programs.find((g) => g.id === m?.programId)
  return m?.doorPattern ?? program?.docks?.pattern ?? DEFAULT_PATTERN
}

const doorPattern: ParamKind<Docking[]> = {
  id: 'dock.pattern',
  module: 'docks',
  order: 140,
  rank: 12,
  area: 'massing',
  label: 'Door patterns',
  help: 'Each docking program’s doors on the grid: a door every 1 to N modules, from which (never door by door)',
  fields: 'floors',
  hint: '',
  unit: 'floors',
  step: 1,
  range: MOST_EVERY,
  prepare: (p, ctx) => patternsOf(p, ctx.option, ctx.grid),
  variables(_ctx, { range }, patterns) {
    const most = Math.max(1, Math.round(range))
    return patterns.flatMap((x): Variable[] => [
      {
        key: `${x.programId}.every`,
        kind: 'dock.pattern',
        target: x.programId,
        label: `${x.name} · a door every … modules`,
        gene: { kind: 'real', min: 1, max: most, step: 1 },
        read: (p) => patternOf(p, x.masses[0]).every,
      },
      {
        key: `${x.programId}.offset`,
        kind: 'dock.pattern',
        target: x.programId,
        label: `${x.name} · doors from module`,
        gene: { kind: 'real', min: 0, max: most - 1, step: 1 },
        read: (p) => patternOf(p, x.masses[0]).offset,
      },
    ])
  },
  write(p, values, _ctx, patterns) {
    let q = p
    for (const x of patterns) {
      const every = values.get(`${x.programId}.every`)
      const offset = values.get(`${x.programId}.offset`)
      if (every === undefined && offset === undefined) continue
      for (const id of x.masses) {
        const now = patternOf(q, id)
        const e = Math.max(1, Math.round(every ?? now.every))
        // a door every e modules: an offset of e or more is one of fewer
        const { mask: _, ...rest } = now
        q = setDoorPattern(q, id, { ...rest, every: e, offset: Math.round(offset ?? now.offset) % e })
      }
    }
    return q
  },
}

export const DOCKS_PARAMS: ParamKind[] = [doorPattern]
