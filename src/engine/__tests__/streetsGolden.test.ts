// The streets' golden snapshot (Phase PE.1, task 1): the roads derive() gives for the streets-drawn-by-an-edge and the
// streets-that-meet scenarios and for the sample, to the millimetre. Written before the path engine; tasks 2 to 8 keep
// it (a change is a change of what the plan shows). Task 9 updates it only for the scenarios whose street ends land on
// an existing street. Phase PE.2, task 6: the sample (the demo) has its south street, an existing street along its boundary, which a saved frontage became (its road is listed first).
import { describe, expect, it } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { derive } from '../derive.ts'
import { demoProject } from '../../state/demo.ts'
import { meetingStreets, sidedStreets } from './stress/scenarios.ts'

const mm = (v: number) => Math.round(v * 1000) / 1000
const roadsOf = (p: Project) => derive(p).circulation.roads.map((r) => ({ id: r.id, width: mm(r.width), points: r.points.map((q) => [mm(q.x), mm(q.y)]) }))

describe('the streets, as they are drawn today', () => {
  for (const s of [...sidedStreets(), ...meetingStreets()]) it(s.name, () => expect(roadsOf(s.project)).toMatchSnapshot())
  it('the sample', () => expect(roadsOf(demoProject())).toMatchSnapshot())
})
