// Starter projects (Decision "Starter projects"): each kept once in a browser, blank and on its site; removed, it does
// not come back.
import { beforeEach, describe, expect, it } from 'vitest'
import { library } from '../../../io/library.ts'
import { seedStarters, SEEDED_KEY, STARTERS } from '../starters.ts'

const ID = 'industrial-quezaltepeque-demo'

beforeEach(() => localStorage.clear())

describe('starter projects', () => {
  it('the Quezaltepeque demo is kept once: an industrial project with its site and ground, nothing built', async () => {
    await seedStarters()
    const e = library.list().find((x) => x.id === ID)
    expect(e?.name).toBe(ID)
    expect(e?.thumb).toContain('<svg')
    const p = library.read(ID)!.project
    expect(p.typology).toBe('industrial')
    expect(p.site.boundary?.vertices.length).toBeGreaterThan(3)
    expect(p.site.terrain?.contours.length).toBeGreaterThan(100)
    expect(p.site.geo?.lat).toBeCloseTo(13.82, 1)
    expect(p.masses).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(SEEDED_KEY)!)).toEqual(Object.keys(STARTERS))
  })

  it('removed, it is not given again; changed, it is left as it is', async () => {
    await seedStarters()
    const p = library.read(ID)!.project
    library.write({ ...p, name: 'Mine' }, 'o1', 1)
    await seedStarters()
    expect(library.read(ID)!.project.name).toBe('Mine')
    library.remove(ID)
    await seedStarters()
    expect(library.read(ID)).toBeNull()
  })
})
