// The banks (Phase E.5, Decision "Banks"): from a platform's edge the ground rises or falls at the standards' 1 : n
// until it meets the ground as it is; their cut and fill are the platform's too (its balance is its masses' and
// courts' alone); a platform whose banks leave the site is an Issue; the 3D's ground follows them. The demo on a plane
// rising 5 % east from 100 m at x 0, Building 1's platform typed at 110 m: east of Warehouse 2 (its east wall at x 390,
// the ground 119.5 m there) a cut bank at 1 : 2 meets the ground about 21 m out (110 + s / 2 = 119.5 + 0.05 s).
import { describe, expect, it } from 'vitest'
import type { GroundPoint, Project, Terrain } from '../../../../model/schema.ts'
import { updateStandards } from '../../../../state/actions/circulation.ts'
import { balanceWithBanks, setPlatformLevel } from '../../actions.ts'
import { setTerrain } from '../../../../state/actions/site.ts'
import { demoProject } from '../../../../state/demo.ts'
import { derive } from '../../../../engine/derive.ts'
import { pointInPolygon } from '../../../../engine/geom/polygon.ts'
import { gradedSurfaceOf, surfaceOf } from '../index.ts'
import { EARTH_BANK, EARTH_NONE, type Earthwork } from '../../../../engine/types.ts'

const plane = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}
const typed = (ratio = 2): Project => updateStandards(setPlatformLevel(setTerrain(demoProject(), plane()), 'b1', 110), { bankRatio: ratio })
const kindAt = (e: Earthwork, x: number, y: number) => {
  const g = e.grid
  return g.kind[Math.floor((y - g.y0) / g.size) * g.cols + Math.floor((x - g.x0) / g.size)]
}

describe('the banks', () => {
  it('a cut bank east of the platform, as far as it meets the ground; steeper, nearer', () => {
    const e = derive(typed()).earthwork!
    expect(kindAt(e, 395, 110)).toBe(EARTH_BANK)
    expect(kindAt(e, 408, 110)).toBe(EARTH_BANK)
    expect(kindAt(e, 416, 110)).toBe(EARTH_NONE)
    const steep = derive(typed(1)).earthwork!
    // 110 + s = 119.5 + 0.05 s: about 10 m out
    expect(kindAt(steep, 395, 110)).toBe(EARTH_BANK)
    expect(kindAt(steep, 405, 110)).toBe(EARTH_NONE)
  })

  it('their cut and fill are the platform’s, and the option’s; a gentler bank moves more ground', () => {
    const b1 = derive(typed()).earthwork!.platforms[0]
    expect(b1.banks.cut).toBeGreaterThan(100)
    expect(b1.banks.fill).toBeGreaterThan(100)
    expect(b1.cut).toBeGreaterThan(b1.banks.cut)
    const steep = derive(typed(1)).earthwork!.platforms[0]
    expect(steep.banks.cut).toBeLessThan(b1.banks.cut)
    // the balance is its masses’ and courts’ alone: the banks do not move it
    expect(steep.balanced).toBeCloseTo(b1.balanced!, 9)
  })

  it('a platform whose banks leave the site is an Issue', () => {
    const issues = (p: Project) => derive(p).issues.filter((i) => i.code === 'terrain' && /banks/.test(i.message))
    expect(issues(typed())).toEqual([])
    const out = issues(typed(4))
    expect(out).toHaveLength(1)
    expect(out[0].message).toMatch(/^The banks of Building 1’s platform leave the site \(about [\d,]+ m² outside\)\.$/)
    expect(out[0].massIds.sort()).toEqual(['m1', 'm2', 'm3'])
    // it stands where they leave the site: a cell of them outside, not between its masses
    const site = derive(typed(4)).site.polygon!
    expect(out[0].at).toBeDefined()
    expect(pointInPolygon(out[0].at!, site)).toBe(false)
    expect(derive(typed()).earthwork!.platforms[0].banks.outsideAt).toBeNull()
  })

  it('the 3D’s ground follows the bank: halfway out, halfway up', () => {
    const p = typed()
    const e = derive(p).earthwork!
    const g = gradedSurfaceOf(surfaceOf(p.site.terrain!)!, e)!
    // 10 m out from the wall: 110 + 10 / 2
    expect(Math.abs(g.elevation({ x: 400, y: 110 })! - 115)).toBeLessThan(1)
    // past where it meets the ground: the ground as it is
    expect(g.elevation({ x: 430, y: 110 })).toBeCloseTo(100 + 0.05 * 430, 1)
  })
})

describe('Balance with banks', () => {
  // a ridge along x 250: the banks are fill either side, so the balanced level leaves fill over
  const ridge = (): Terrain => {
    const points: GroundPoint[] = []
    for (let x = -100; x <= 700; x += 25) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 120 - 0.08 * Math.abs(x - 250) })
    return { contours: [], points }
  }

  it('types the level at which its cut and fill balance, its banks counted; lower than the balanced one on a ridge', () => {
    const p = setTerrain(demoProject(), ridge())
    const before = derive(p).earthwork!.platforms[0]
    expect(before.typed).toBe(false)
    expect(before.fill - before.cut).toBeGreaterThan(1000)
    const q = balanceWithBanks(p, 'b1', p.options[0].id)
    const after = derive(q).earthwork!.platforms[0]
    expect(after.typed).toBe(true)
    expect(after.level!).toBeLessThan(before.level!)
    // to the centimetre: what is left is under a centimetre over what it grades
    expect(Math.abs(after.fill - after.cut)).toBeLessThan(after.area * 0.01 + 50)
    expect(after.level).toBeCloseTo(Math.round(after.level! * 100) / 100, 9)
  })

  it('nothing to balance without ground: the same project', () => {
    const p = demoProject()
    expect(balanceWithBanks(p, 'b1', p.options[0].id)).toBe(p)
  })
})
