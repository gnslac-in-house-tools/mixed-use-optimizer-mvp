// Options grouped under another (Decision "Stage options"): a stage plan's options fold under the option it started
// from, the latest first; with that option gone they stand on their own. The verb sets or clears a group, never under
// itself or under an option that is not there.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { addOption, removeOption, setOptionGroup } from '../../state/actions/buildings.ts'
import { demoProject } from '../../state/demo.ts'
import { optionGroups } from '../buildings.ts'

/** The demo with two more options, both grouped under Option 1. */
function grouped(): Project {
  let p = demoProject()
  for (const name of ['① Grid · #4', '② Buildings · #9']) {
    const r = addOption(p, { name })
    p = setOptionGroup(r.project, r.id, { under: 'o1', name: 'Stages' })
  }
  return p
}
const view = (p: Project) => optionGroups(p).map((e) => [e.option.name, e.groups.map((g) => [g.name, g.options.map((o) => o.name)])])

describe('options grouped under another', () => {
  it('follow it, the latest first', () => {
    expect(view(grouped())).toEqual([['Option 1', [['Stages', ['② Buildings · #9', '① Grid · #4']]]]])
  })

  it('with that option gone, stand on their own', () => {
    const p = addOption(grouped(), { name: 'Option 2' }).project
    expect(view(removeOption(p, 'o1')).map(([name]) => name)).toEqual(['① Grid · #4', '② Buildings · #9', 'Option 2'])
  })

  it('the verb: set, cleared, never under itself or an option not there; the same group changes nothing', () => {
    const p = grouped()
    const id = p.options[1].id
    expect(setOptionGroup(p, id, { under: 'o1', name: 'Stages' })).toBe(p)
    expect(setOptionGroup(p, id, { under: id, name: 'Stages' })).toBe(p)
    expect(setOptionGroup(p, id, { under: 'nope', name: 'Stages' })).toBe(p)
    expect('group' in setOptionGroup(p, id, undefined).options[1]).toBe(false)
  })
})
