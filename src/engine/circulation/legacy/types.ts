// What the derived network read and made before ST.4 (Decision "Streets"): kept for the migration alone, which draws
// an old project's derived roads as streets once (legacy/toStreets.ts).
import type { DesignOption, Id, Point } from '../../../model/schema.ts'
import type { DerivedRoad } from '../../types.ts'

/** An option as version 10 wrote it: the buildings whose ring was off, the points that removed derived roads. */
export type LegacyOption = DesignOption & { ringOff?: Id[]; removedRoads?: Point[] }

/** A road of the old network: a ring's side (of a building) or a link, beside the kept ones. */
export interface LegacyRoad extends Omit<DerivedRoad, 'kind'> {
  kind: DerivedRoad['kind'] | 'ring' | 'link'
  buildingId?: Id
}
