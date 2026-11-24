// What a view asks to know whether to show a module's controls (Decision "What is not there is not shown"): the catalog's
// two questions about the open project, read from the store so that an import, an edit or an undo re-renders at once.
//   offered   the project's typology lists the module: what creates something of it follows this (the Mass tool's
//             Warehouse entry, the Brief's docks column, the standards' stall fields)
//   on        offered, and the project has something the module acts on: what adjusts or measures follows this (its
//             tab, its figures, its Show buttons)
// The two are booleans, so a component re-renders only when one changes, not on every edit of the project.
import { isOffered, isOn } from '../modules/catalog.ts'
import { useApp } from '../state/store.ts'

export function useModule(id: string): { offered: boolean; on: boolean } {
  const offered = useApp((s) => isOffered(s.project, id))
  const on = useApp((s) => isOn(s.project, id))
  return { offered, on }
}
