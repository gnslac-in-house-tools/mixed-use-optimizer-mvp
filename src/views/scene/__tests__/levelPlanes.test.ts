// Each level as a plane in the 3D (Decision "Level planes"): the shown buildings' levels, at their floors, over the
// building's footprint (the site's while it has no masses).
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { addBuilding } from '../../../state/actions/buildings.ts'
import { addLevelAtEnd } from '../../../state/actions/levels.ts'
import { demoProject } from '../../../state/demo.ts'
import { building } from '../../layers/keys.ts'
import { levelPlanes } from '../LevelPlanes.tsx'

describe('the level planes', () => {
  it('one per level of each shown building, at its elevation, the active one marked; a hidden building has none', () => {
    const up = addLevelAtEnd(demoProject(), 'above')
    const b = addBuilding(up.project, { name: 'Tower B', optionId: 'o1' })
    const p = b.project
    const planes = levelPlanes(p, derive(p), 'o1', [], 'l1')
    expect(planes.map((x) => [x.id, x.z, x.active])).toEqual([
      ['l1', 0, true],
      [up.id, 12, false],
      [b.levelId, 0, false],
    ])
    // Building 1's two levels share its footprint; Tower B has no masses: the site's box
    expect(planes[0].width).toBe(planes[1].width)
    expect(planes[2].width).toBeGreaterThan(planes[0].width)
    expect(levelPlanes(p, derive(p), 'o1', [building(b.id)], 'l1').map((x) => x.id)).toEqual(['l1', up.id])
  })
})
