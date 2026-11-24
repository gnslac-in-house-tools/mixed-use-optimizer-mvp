// An option has roads in the engine's sense (`hasRoads`, streets.ts): gates (its own or the site's) or streets; since
// ST.4 a built mass derives none (Decision "Streets"). What the Circulation tab and the parking module ask (Decision
// "What is not there is not shown").
import { describe, expect, it } from 'vitest'
import { hasRoads } from '../circulation/streets.ts'
import { addGate } from '../../state/actions/circulation.ts'
import { addRoad } from '../../state/__tests__/road.ts'
import { addMass } from '../../state/actions/masses.ts'
import { setBoundary } from '../../state/actions/site.ts'
import { contourFromPolygon } from '../geom/contour.ts'
import { newProject } from '../../typologies/index.ts'

const site = contourFromPolygon([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }])
const rect = { kind: 'rect', center: { x: 100, y: 100 }, width: 30, depth: 40, rotation: 0 } as const
const roads = (p: ReturnType<typeof newProject>) => hasRoads(p, p.options[0])

describe('hasRoads', () => {
  it('none on an empty site, nor round a built mass (no ring since ST.4); a gate or a street has them', () => {
    const empty = setBoundary(newProject('blank'), site)
    expect(roads(empty)).toBe(false)
    expect(roads(addGate(empty, 'o1', 0.1).project)).toBe(true)
    expect(roads(addRoad(empty, 'o1', [{ x: 10, y: 10 }, { x: 150, y: 10 }])!.project)).toBe(true)
    expect(roads(addMass(empty, { programId: null, footprint: rect }).project)).toBe(false)
  })

  it('a gate of the site counts for the option that has none of its own', () => {
    const p = setBoundary(newProject('blank'), site)
    const withSiteGate = { ...p, site: { ...p.site, gates: [{ id: 'g1', t: 0.1, width: 8, radius: 12, flow: 'both' as const, vehicles: 'all' as const }] } }
    expect(roads(withSiteGate)).toBe(true)
    // an option with gates of its own (an empty list) uses those instead
    const own = { ...withSiteGate, options: [{ ...withSiteGate.options[0], gates: [] }] }
    expect(roads(own)).toBe(false)
  })
})
