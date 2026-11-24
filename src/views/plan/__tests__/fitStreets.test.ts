// What "fit" frames (Phase PE.2, task 6): the street a site faces. A saved frontage became an existing street along the boundary, and the plan
// still frames it, as it framed the frontage's street; an existing street across the site is not framed.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { addExistingRoad } from '../../../state/actions/circulation.ts'
import { demoProject } from '../../../state/demo.ts'
import { contentBounds } from '../PlanSvg.tsx'

describe('contentBounds', () => {
  it('the demo’s south street, an existing street along its boundary, is framed: 15 m south of the site', () => {
    const b = contentBounds(derive(demoProject({ streets: false })))
    expect(b.minY).toBeCloseTo(-15, 6)
    expect(contentBounds(derive(demoProject({ streets: false, southStreet: false }))).minY).toBeCloseTo(0, 6)
  })

  it('an existing street across the site is not', () => {
    const p = addExistingRoad(demoProject({ streets: false, southStreet: false }), [{ x: 20, y: 130 }, { x: 400, y: 120 }], 30)!.project
    expect(contentBounds(derive(p)).minY).toBeCloseTo(0, 6)
  })
})
