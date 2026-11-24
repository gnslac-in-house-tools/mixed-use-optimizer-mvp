// What the brief asks of the parking (Phase K.4, Decision "Program rule set": the Brief's Circulation tab, its Demand):
// per program, a car stall per so many m² of its floor and so many trailer stalls per dock door of its masses; what the
// option asks, summed, and the Issue when its car stalls along the roads fall short. Trailer stalls are only asked:
// where they stand (a trailer yard) comes later. Pure.
import type { Id, Project } from '../../../model/schema.ts'
import type { DerivedDock, Issue } from '../../../engine/types.ts'

/** A program's demand: the stalls it asks (null: it asks none of that kind). */
export interface DemandRow {
  programId: Id
  name: string
  carStalls: number | null
  trailerStalls: number | null
}

/** The option's demand: each program's, and their sums (null: no program asks any). */
export interface Demand {
  rows: DemandRow[]
  carStalls: number | null
  trailerStalls: number | null
}

const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((s, x) => s + (x ?? 0), 0) : null)

/** What each program asks, from its floor area in the option (`areaByProgram`) and its masses' dock doors (`docks`). */
export function demandOf(p: Pick<Project, 'programs' | 'masses'>, areaByProgram: Record<Id, number>, docks: DerivedDock[]): Demand {
  const programOf = new Map(p.masses.map((m) => [m.id, m.programId]))
  const doors = new Map<Id, number>()
  for (const d of docks) {
    const g = programOf.get(d.massId)
    if (g) doors.set(g, (doors.get(g) ?? 0) + d.doors.length)
  }
  const rows = p.programs.map(
    (g): DemandRow => ({
      programId: g.id,
      name: g.name,
      carStalls: g.demand?.carStalls ? Math.ceil((areaByProgram[g.id] ?? 0) / g.demand.carStalls - 1e-9) : null,
      trailerStalls: g.demand?.trailerStalls ? Math.ceil((doors.get(g.id) ?? 0) * g.demand.trailerStalls - 1e-9) : null,
    }),
  )
  return { rows, carStalls: sum(rows.map((r) => r.carStalls)), trailerStalls: sum(rows.map((r) => r.trailerStalls)) }
}

/** The car stalls short of the demand (0: met); null when no program asks any. */
export const stallsShort = (d: Demand, stalls: number): number | null => (d.carStalls === null ? null : Math.max(0, d.carStalls - stalls))

/** Flow's Issue (`parking`): the car stalls along the roads fall short of what the programs ask. */
export function demandIssues(d: Demand, stalls: number): Issue[] {
  const short = stallsShort(d, stalls)
  if (!short) return []
  const who = d.rows.filter((r) => r.carStalls).map((r) => `${r.name} ${r.carStalls}`)
  return [
    {
      code: 'parking',
      severity: 'warning',
      massIds: [],
      message: `${short} car ${short === 1 ? 'stall' : 'stalls'} short: ${stalls} along the roads of the ${d.carStalls} the brief asks (${who.join(', ')}).`,
    },
  ]
}
