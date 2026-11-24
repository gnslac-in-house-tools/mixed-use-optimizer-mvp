// A program as the rule set for its forms (Decision "Program rule set"), pure: its kind, its warehouse type (a
// Warehouse program's deep definition, one per program), its grid and the sizes its masses may take. The Brief shows
// the general level, the Program editor the deep one; both read them here, so they show the same figures.
import type { Id, Program, ProgramKind, Project, WarehouseType } from '../model/schema.ts'

type Grid = WarehouseType['grid']
type Range = [number, number]

/** What it is: a warehouse, an office or free (absent: free). */
export const kindOf = (g: Program): ProgramKind => g.kind ?? 'free'

/** A Warehouse program's warehouse type: the one that defines it (none: only its general level yet). */
export const definitionOf = (p: Project, programId: Id): WarehouseType | undefined => p.warehouseTypes?.find((t) => t.program === programId)

/** The program a warehouse type defines. */
export const programOfType = (p: Project, t: WarehouseType): Program | undefined => (t.program === null ? undefined : p.programs.find((g) => g.id === t.program))

/** Its grid: its warehouse type's, else its own (none: null). */
export function programGrid(p: Project, g: Program): Grid | null {
  return definitionOf(p, g.id)?.grid ?? g.grid ?? null
}

/** The sizes its masses may take, width (the long side) and depth: its warehouse type's hall's, else its own. */
export function programRange(p: Project, g: Program): { width?: Range; depth?: Range } | undefined {
  const t = definitionOf(p, g.id)
  if (!t) return g.range
  const r = t.hall.range
  return r && { ...(r.length && { width: r.length }), ...(r.width && { depth: r.width }) }
}
