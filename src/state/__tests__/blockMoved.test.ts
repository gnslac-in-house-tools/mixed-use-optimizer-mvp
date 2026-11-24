// A placed block moved by anything but its own verbs (a drag, a turn, Solve on an Issue, Arrange) keeps every wall
// editable (the user, 2026-11-04: "I extended my block past the site, pressed Solve on its warning, and I could not
// grow it any more"). Whatever moves masses moves the hall alone, never the copy's `place`; the block's walls are found
// from where its hall stands (`copyOnPlan`, modules/warehouse/engine/copies.ts), whichever verb moved it.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { derive } from '../../engine/derive.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { centroid } from '../../engine/geom/polygon.ts'
import { actions } from '../actions/index.ts'
import { sampleProject } from '../sample.ts'

const start = () => {
  const p = sampleProject()
  const b = p.buildings.find((x) => x.warehouse && p.options[0].buildingIds.includes(x.id))!
  const levels = new Set(b.levels.map((l) => l.id))
  const hall = (q: Project) => q.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
  return { p, o: p.options[0].id, b, hall }
}

/** Every wall of the block's hall known for what it is, and each moved by a module (6 m asked: two of 3 m). */
function editable(p: Project, id: string) {
  const n = footprintPolygon(p.masses.find((m) => m.id === id)!.footprint).length
  const walls = Array.from({ length: n }, (_, i) => actions.blockWall(p, id, i))
  expect(walls.every((w) => w !== null)).toBe(true)
  expect(actions.blockWalls(p, id)).toEqual(walls.map((w) => w!.kind))
  for (let i = 0; i < n; i++) expect(actions.stretchBlockWall(p, id, i, 6)?.applied).toBe(6)
}

/** Each box's wall stretched a module: the hall grows where it stands (its middle 3 m on at most), never back where it was made. */
function growsInPlace(p: Project, id: string) {
  const mid = (q: Project) => centroid(footprintPolygon(q.masses.find((m) => m.id === id)!.footprint))
  const at = mid(p)
  actions.blockWalls(p, id)!.forEach((kind, i) => {
    if (kind !== 'box') return
    const c = mid(actions.stretchBlockWall(p, id, i, 6)!.project)
    expect(Math.hypot(c.x - at.x, c.y - at.y)).toBeLessThan(3.5)
  })
}

describe('a block moved, then edited', () => {
  const movers: [string, (p: Project, id: string, o: string) => Project][] = [
    ['dragged', (p, id) => actions.moveMasses(p, [id], { x: 40, y: -25 })],
    ['turned a quarter', (p, id) => actions.rotateMasses(p, [id], 90)],
    ['turned 30°', (p, id) => actions.rotateMasses(p, [id], 30)],
    ['arranged', (p, _id, o) => actions.arrange(p, o)],
  ]
  for (const [name, move] of movers)
    it(`${name}: every wall known and each moved by a module, in place`, () => {
      const { p, o, hall } = start()
      const q = move(p, hall(p).id, o)
      editable(q, hall(q).id)
      growsInPlace(q, hall(q).id)
    })

  it('grown out of the site, then Solve on its Issue: its walls still grow (the user’s case)', () => {
    const { p, o, hall } = start()
    const id = hall(p).id
    const i = actions.blockWalls(p, id)!.findIndex((_, k) => {
      const r = actions.stretchBlockWall(p, id, k, 150)
      return !!r?.applied && derive(r.project, o).issues.some((x) => x.code === 'outside-buildable' && x.massIds.includes(id))
    })
    expect(i).toBeGreaterThanOrEqual(0)
    const grown = actions.stretchBlockWall(p, id, i, 150)!.project
    const issue = derive(grown, o).issues.find((x) => x.code === 'outside-buildable' && x.massIds.includes(id))!
    const solved = actions.solveIssue(grown, o, hall(grown).levelId, issue).project
    expect(hall(solved).footprint).not.toEqual(hall(grown).footprint)
    editable(solved, id)
    growsInPlace(solved, id)
  })
})
