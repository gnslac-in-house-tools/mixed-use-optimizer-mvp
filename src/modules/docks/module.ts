// The docks module (Decision "Exterior circulation", "Docks on or off"): dock walls and doors, truck courts; for the
// optimizer, how far a truck goes and courts that do not fit (measures.ts), the doors' pattern (params.ts). Present when
// some mass gets dock walls: its own (a non-empty list) or, with none of its own, its program's.
import { DOCKS_KPIS } from './kpis.ts'
import type { Module } from '../types.ts'
import { DOCKS_MEASURES } from './measures.ts'
import { DOCKS_PARAMS } from './params.ts'

export const docks: Module = {
  id: 'docks',
  label: 'Docks',
  present: (p) => {
    const docked = new Set(p.programs.filter((g) => g.docks).map((g) => g.id))
    return p.masses.some((m) => (m.docks ? m.docks.length > 0 : m.programId !== null && docked.has(m.programId)))
  },
  kpis: () => DOCKS_KPIS,
  measures: DOCKS_MEASURES,
  params: DOCKS_PARAMS,
}
