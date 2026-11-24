// The brief against the design (Decision "Brief"): what each program asks (its target area and how many masses) and
// what the active option has. Pure, like the rest of the engine: the Brief workspace, the Summary, the KPI strip and
// the graph's Solve (its masses still missing) and MCP read it.
//   area   the program's floor area (Metrics.areaByProgram: GFA for a built program, ground for an open one)
//   count  its masses (a typical floor counts once)
// A figure within BRIEF_TOLERANCE of its target meets it; below is under, above is over. Where the design and the
// brief differ in how many masses (briefGaps) is what Massing's notice offers to settle, one way or the other
// (Decision "Brief sync"). Money (a pro forma) comes later as more columns of the brief, not as another model.
import type { Id, Program, Project } from '../model/schema.ts'
import type { Derived, Issue } from './types.ts'

/** ±5 %: closer than this to the target, a figure meets it. */
export const BRIEF_TOLERANCE = 0.05

/** m²: a new mass's area when neither the brief nor its program says. */
export const DEFAULT_MASS_AREA = 6000

/** A new mass is twice as wide as it is deep (Decision "New mass size"; the user: "always 2:1 by default"). */
export const MASS_RATIO = 2

/** The most elongated a mass of a free size may become, long side over short, when its program does not say (Decision
 *  "Fixed size"). */
export const MAX_ASPECT = 3

/** How elongated the optimizer may make a program's masses: its own limit, else MAX_ASPECT. */
export const programAspect = (program: Program | undefined | null): number => program?.maxAspect ?? MAX_ASPECT

/** The size the brief asks exactly of each of its masses (its `size` set by hand and fixed), or null: free. */
export const fixedSize = (program: Program | undefined | null): { width: number; depth: number } | null =>
  program?.size?.fixed ? { width: program.size.width, depth: program.size.depth } : null

/**
 * m²: the area a new mass of this program starts with: the brief's per mass (its target area ÷ its masses; the whole
 * area when it does not count them), or the program's typical one (`massArea`, from its typology), or the default.
 */
export function newMassArea(program: Program | undefined | null): number {
  const area = program?.target?.area
  const count = program?.target?.count
  if (area && area > 0 && count !== 0) return area / (count ?? 1)
  return program?.massArea ?? DEFAULT_MASS_AREA
}

/** A rectangle of about this area at MASS_RATIO, its depth to the half metre (at least half a metre). */
export function massRect(area: number): { width: number; depth: number } {
  const depth = Math.max(0.5, Math.round(Math.sqrt(area / MASS_RATIO) * 2) / 2)
  return { width: depth * MASS_RATIO, depth }
}

/** The rectangle a new mass of this program starts with: its own (`size`, set by hand), or its area at 2:1. */
export function programSize(program: Program | undefined | null): { width: number; depth: number } {
  return program?.size ?? massRect(newMassArea(program))
}

/** Why a program cannot be removed (masses use it, in any option), or null. */
export function whyKeepProgram(p: Project, id: Id): string | null {
  const n = p.masses.filter((m) => m.programId === id).length
  return n === 0 ? null : `${n === 1 ? '1 mass uses' : `${n} masses use`} it: give ${n === 1 ? 'it' : 'them'} another program first`
}

export type BriefStatus = 'met' | 'under' | 'over'

/** How a figure stands against its target; null without a target. A zero target is met only by zero. */
export function briefStatus(value: number, target: number | null | undefined): BriefStatus | null {
  if (target === null || target === undefined) return null
  if (target === 0) return value === 0 ? 'met' : 'over'
  const r = value / target - 1
  return Math.abs(r) <= BRIEF_TOLERANCE + 1e-9 ? 'met' : r < 0 ? 'under' : 'over'
}

export interface BriefRow {
  programId: string
  targetArea: number | null
  targetCount: number | null
  /** The target area shared by the target count: what one mass should be (null without both). */
  unitArea: number | null
  area: number
  count: number
  areaStatus: BriefStatus | null
  countStatus: BriefStatus | null
}

/** One row per program, in the project's order, as the active option (`d.option`) stands (its `metrics`). */
export function briefRows(p: Project, d: Pick<Derived, 'metrics'>): BriefRow[] {
  return p.programs.map((g) => {
    const targetArea = g.target?.area ?? null
    const targetCount = g.target?.count ?? null
    const area = d.metrics.areaByProgram[g.id] ?? 0
    const count = d.metrics.massesByProgram[g.id] ?? 0
    return {
      programId: g.id,
      targetArea,
      targetCount,
      unitArea: targetArea !== null && targetCount ? targetArea / targetCount : null,
      area,
      count,
      areaStatus: briefStatus(area, targetArea),
      countStatus: briefStatus(count, targetCount),
    }
  })
}

export interface BriefGap {
  programId: Id
  /** How many masses the brief asks for; null: it does not count this program. */
  asks: number | null
  /** How many the option has. */
  has: number
}

/**
 * Where the design and the brief differ in how many masses (Decision "Brief sync"): a program whose count is not the
 * brief's, or that has masses the brief does not count (drawn freely). Areas are not compared here: the Brief's
 * columns colour them (±5 %).
 */
export function briefGaps(rows: BriefRow[]): BriefGap[] {
  return rows
    .filter((r) => (r.targetCount !== null ? r.count !== r.targetCount : r.count > 0))
    .map((r) => ({ programId: r.programId, asks: r.targetCount, has: r.count }))
}

/**
 * The gaps as Issues (Decision "Brief issues"): one per program whose masses are not the number the brief asks for,
 * about its masses when it has too many (so a click goes to one). A program the brief does not count is not one: drawn
 * freely, it breaks nothing. Code `brief`, a warning: the Summary's Issues tab offers ▶ Solve and Update brief.
 */
export function briefIssues(p: Project, d: Pick<Derived, 'metrics'>, massesOf: (programId: Id) => Id[]): Issue[] {
  return briefGaps(briefRows(p, d)).flatMap((g): Issue[] => {
    if (g.asks === null) return []
    const name = p.programs.find((x) => x.id === g.programId)?.name ?? g.programId
    const n = (k: number) => (k === 1 ? '1 mass' : `${k} masses`)
    const short = g.has < g.asks
    const message = short ? `${name}: ${g.has} of the ${n(g.asks)} the brief asks for.` : `${name}: ${n(g.has)}, the brief asks for ${g.asks}.`
    return [{ code: 'brief', severity: 'warning', massIds: short ? [] : massesOf(g.programId), message, program: g.programId }]
  })
}

export interface BriefTotals {
  /** The sum of the target areas (null: no program has one). */
  targetArea: number | null
  /** The area of the programs that have a target. */
  area: number
  status: BriefStatus | null
}

/** The brief as a whole: the programs with a target area, their sum against what they have. */
export function briefTotals(rows: BriefRow[]): BriefTotals {
  const asked = rows.filter((r) => r.targetArea !== null)
  if (asked.length === 0) return { targetArea: null, area: 0, status: null }
  const targetArea = asked.reduce((s, r) => s + r.targetArea!, 0)
  const area = asked.reduce((s, r) => s + r.area, 0)
  return { targetArea, area, status: briefStatus(area, targetArea) }
}
