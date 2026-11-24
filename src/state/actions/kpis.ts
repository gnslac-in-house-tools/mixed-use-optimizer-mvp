// KPI strip actions (Decision "KPI strip"): which KPIs the client sees and in what order is a project decision, so it
// is a verb, saved in the .gft and undone with Ctrl+Z. Pure, like the mass actions; an edit that changes nothing
// returns the same project (no empty undo step). Positions are among the KPIs shown (`chosenKpis`): a chosen KPI whose
// module is off, or that nothing declares, keeps its place in the list and comes back with its module (Decision
// "What is not there is not shown").
import type { Project } from '../../model/schema.ts'
import { DEFAULT_KPIS } from '../../engine/kpis.ts'
import { chosenKpis } from '../../modules/catalog.ts'

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** The project's own list: its choice, or the default. */
const listOf = (p: Project) => p.kpis ?? DEFAULT_KPIS

/** The list with the shown KPIs in a new order, the others where they were (`before` and `after` are the same ids). */
function reordered(list: string[], before: string[], after: string[]): string[] {
  const shown = new Set(before)
  let k = 0
  return list.map((id) => (shown.has(id) ? after[k++] : id))
}

/** The strip as given (duplicates dropped). */
export function setKpis(p: Project, ids: string[]): Project {
  const next = [...new Set(ids)]
  return p.kpis && same(p.kpis, next) ? p : { ...p, kpis: next }
}

/** Shows a KPI at the end of the strip (or before the one shown at `at`); already shown, nothing changes. */
export function showKpi(p: Project, id: string, at?: number): Project {
  const shown = chosenKpis(p)
  if (shown.includes(id)) return p
  const i = at === undefined ? shown.length : Math.max(0, Math.min(shown.length, at))
  // a place the id already has in the list (its module was off) moves with it
  const rest = listOf(p).filter((x) => x !== id)
  const slot = i < shown.length ? rest.indexOf(shown[i]) : rest.length
  return setKpis(p, [...rest.slice(0, slot), id, ...rest.slice(slot)])
}

/** Hides a shown KPI; the others, shown or not, stay as they are. */
export function hideKpi(p: Project, id: string): Project {
  return chosenKpis(p).includes(id) ? setKpis(p, listOf(p).filter((x) => x !== id)) : p
}

/** Moves the KPI at `from` to `to` (positions among the KPIs shown). */
export function moveKpi(p: Project, from: number, to: number): Project {
  const shown = chosenKpis(p)
  if (from < 0 || from >= shown.length || to < 0 || to >= shown.length || from === to) return p
  const next = shown.slice()
  const [id] = next.splice(from, 1)
  next.splice(to, 0, id)
  return setKpis(p, reordered(listOf(p), shown, next))
}
