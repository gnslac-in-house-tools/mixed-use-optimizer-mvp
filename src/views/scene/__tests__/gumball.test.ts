// The 3D gumball (Decision "Gumball"): a drag snaps to the grid's modules along its axes (on none, whole metres) and up
// and down by half metres; let go, the masses go along the plan and to their building's level at the height, a new one
// only when asked. The demo: Warehouse 1 (m1, 160 × 80 at 120, 110, 12 m high), all on Building 1's L1 at 0.
import { describe, expect, it } from 'vitest'
import type { Grid } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { addLevelAtEnd, moveMassesToElevation } from '../../../state/actions/levels.ts'
import { demoProject } from '../../../state/demo.ts'
import { gumballAt, snapMove, targetElevation } from '../gumball.ts'

const grid: Grid = { x: 12, y: 12, modules: 4, origin: { x: 0, y: 0 }, angle: 0 }

describe('a drag snaps', () => {
  it('off the grid, whole metres; up and down, half metres', () => {
    expect(snapMove({ x: 3.4, y: -7.6, z: 1.3 }, null)).toEqual({ x: 3, y: -8, z: 1.5 })
  })

  it('on the grid, whole modules along its axes, turned as it is', () => {
    expect(snapMove({ x: 4.4, y: 7.6, z: 0 }, grid)).toEqual({ x: 3, y: 9, z: 0 })
    const turned = snapMove({ x: 3, y: 3, z: 0 }, { ...grid, angle: 45 })
    // 4.24 m along the turned x: one module (3 m) along it, none across
    expect(Math.hypot(turned.x, turned.y)).toBeCloseTo(3, 9)
    expect(turned.x).toBeCloseTo(turned.y, 9)
  })
})

describe('where it stands and what it does', () => {
  it('on top of the masses, at their box’s middle; the floor a move up takes them to', () => {
    const p = demoProject()
    const at = gumballAt(p, derive(p), ['m1'])!
    expect(at.at.x).toBeCloseTo(120, 6)
    expect(at.at.y).toBeCloseTo(110, 6)
    expect(at.top).toBeGreaterThan(0)
    expect(gumballAt(p, derive(p), [])).toBeNull()
    expect(targetElevation(p, ['m1'], 6)).toBe(6)
  })

  it('to the level at that height; with none there, nothing unless asked, then a new level there', () => {
    const above = addLevelAtEnd(demoProject(), 'above')
    const p = above.project
    const l2 = p.buildings[0].levels.find((l) => l.id === above.id)!
    const there = moveMassesToElevation(p, ['m3'], l2.elevation)!
    expect(there.masses.find((m) => m.id === 'm3')!.levelId).toBe(above.id)
    expect(moveMassesToElevation(p, ['m3'], 30)).toBeNull()
    const made = moveMassesToElevation(p, ['m3'], 30, true)!
    const level = made.buildings[0].levels.find((l) => l.elevation === 30)!
    expect(level.name).toMatch(/^L\d+$/)
    expect(made.masses.find((m) => m.id === 'm3')!.levelId).toBe(level.id)
    expect(made.buildings[0].levels.length).toBe(p.buildings[0].levels.length + 1)
    // where they are already: the same project
    expect(moveMassesToElevation(p, ['m3'], 0)).toBe(p)
  })
})
