// The terrain module (Decision "Terrain"): platforms, earthwork, road grading, the Heights tool; for the optimizer, the
// platforms' levels (params.ts). Present when the site has a terrain (every typology offers it: every site has ground).
import { TERRAIN_KPIS } from './kpis.ts'
import type { Module } from '../types.ts'
import { TERRAIN_PARAMS } from './params.ts'

export const terrain: Module = {
  id: 'terrain',
  label: 'Terrain',
  present: (p) => !!p.site.terrain,
  kpis: () => TERRAIN_KPIS,
  measures: [],
  params: TERRAIN_PARAMS,
}
