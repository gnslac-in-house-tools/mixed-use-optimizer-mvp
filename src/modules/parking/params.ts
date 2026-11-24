// The parking's kind of *What may change* (Decisions "Circulation optimization" and "Catalog"; what every kind shares:
// modules/vary.ts):
//   parking.side      the option's car stalls along its roads (a choice: none · one side · both, over the standard)
import { optionOf } from '../../engine/buildings.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { PARKING_SIDES, type Project } from '../../model/schema.ts'
import { setParking } from './actions.ts'
import type { Context, ParamKind } from '../vary.ts'

/** An option's side now: its own, else the standard's. */
const optionSide = (p: Project, ctx: Context) => optionOf(p, ctx.option.id).parking ?? standardsOf(p).parking

const parking: ParamKind = {
  id: 'parking.side',
  module: 'parking',
  order: 180,
  rank: 17,
  area: 'flow',
  role: 'circulation',
  label: 'Parking',
  help: 'The option’s car stalls along its roads: none, one side or both',
  fields: 'choice',
  hint: 'none · one · both',
  unit: 'choice',
  step: 1,
  variables(ctx) {
    const gene = { kind: 'choice', options: PARKING_SIDES.length } as const
    const at = (side: string) => Math.max(0, PARKING_SIDES.indexOf(side as (typeof PARKING_SIDES)[number]))
    return [{ key: `${ctx.option.id}.parking`, kind: 'parking.side', target: ctx.option.id, label: 'Parking along the roads', gene, choices: PARKING_SIDES, read: (p) => at(optionSide(p, ctx)) }]
  },
  write(p, values, ctx) {
    // only what differs is written: the design's own genome leaves the project as it is
    const own = values.get(`${ctx.option.id}.parking`)
    return own !== undefined && PARKING_SIDES[own] !== optionSide(p, ctx) ? setParking(p, ctx.option.id, PARKING_SIDES[own]) : p
  },
}

export const PARKING_PARAMS: ParamKind[] = [parking]
