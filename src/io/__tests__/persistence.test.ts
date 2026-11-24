// Nothing of a project is lost on the way (QF.4, guarantee 1; the user: "a complete check that guarantees the app does
// save the complete progress"): the demo with plugin data and a log, and every project the circulation's stress builds
// (the scenarios' own builders, imported), is written and read back, as a .gft and as the browser's copy, and comes
// back equal. A field added to the model and forgotten in the schema fails here. Pure: no React, no store.
import { beforeEach, describe, expect, it } from 'vitest'
import { tidyLevels } from '../../engine/levels.ts'
import type { Project } from '../../model/schema.ts'
import { withoutEmptyBuildings } from '../../state/actions/buildings.ts'
import { ensureGrid } from '../../typologies/index.ts'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { sampleProject } from '../../state/sample.ts'
import { readGft, writeGft } from '../gft.ts'
import { library } from '../library.ts'
import {
  carRoads,
  dragSteps,
  extremeStandards,
  facingDocks,
  joined,
  many,
  nonsenseRoads,
  oddGates,
  oddMasses,
  pairs,
  shrinking,
  sidedStreets,
  siteShapes,
  turned,
  type Scenario,
} from '../../engine/__tests__/stress/scenarios.ts'

const builders = [siteShapes, pairs, turned, shrinking, many, facingDocks, nonsenseRoads, oddGates, extremeStandards, oddMasses, dragSteps, joined, carRoads, sidedStreets]

/** The demo as a session leaves it: a plugin's data (nested, as a plugin writes it) and a decision log. */
function demoWithExtras(): Project {
  const p = demoProject()
  return {
    ...p,
    plugins: { optimizer: { on: true, runs: [{ id: 'r1', score: 0.42, picks: ['a', 'b'], when: 1700000000000 }], settings: { seed: 7, nested: { deep: [1, 2, { x: null }] } } }, agent: { on: false } },
    log: [
      { at: 1700000000000, author: 'Designer', by: 'designer', verb: 'moveMass', what: 'Move mass: Warehouse 1', option: p.options[0].id, issues: [0, 1] },
      { at: 1700000001000, author: 'Designer', by: 'solve', verb: 'solve', what: 'Solve', option: p.options[0].id, issues: [1, 0] },
    ],
  }
}

/** The starter projects the app ships (`state/starters/*.gft`), as a browser gets them. */
const starters: Scenario[] = Object.entries(import.meta.glob('../../state/starters/*.gft', { query: '?raw', import: 'default', eager: true }) as Record<string, string>).map(([file, text]) => {
  const r = readGft(text)
  if (!r.ok) throw new Error(`${file}: ${r.error}`)
  return { name: `starter ${file}`, project: r.project }
})

const all: Scenario[] = [
  { name: 'the demo, with plugin data and a log', project: demoWithExtras() },
  { name: 'the sample project', project: sampleProject() },
  ...starters,
  ...builders.flatMap((b) => b()),
]

/** The project after the trip: ok, and read. */
function viaGft(p: Project): Project {
  const r = readGft(writeGft(p))
  if (!r.ok) throw new Error(r.error)
  return r.project
}

/**
 * What a project is on disk and read back. JSON has no negative zero (-0 comes back as 0, the same place) or undefined;
 * and reading normalises on the way in, for its stated purposes only (readGft): no building without masses (Decision
 * "No empty buildings"), the levels its masses make, a grid. The normalisers are applied here by themselves, so zod and
 * the migration must be the identity: anything else that differs is a field the save lost.
 */
const onDisk = (p: Project): Project => ensureGrid(tidyLevels(withoutEmptyBuildings(JSON.parse(JSON.stringify(withoutLegacy(p))) as Project)))

/**
 * Fields of version 10, which the model no longer has (migrate.ts turns them into streets). One stress scenario, 'ring
 * off', still sets one by a cast to exercise the legacy engine: it is no field of the project, so it is not expected back.
 */
const LEGACY = ['ringOff', 'removedRoads', 'ringParking']
const withoutLegacy = (p: Project): Project => ({ ...p, options: p.options.map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !LEGACY.includes(k))) as Project['options'][number]) })

beforeEach(() => localStorage.clear())

describe('persistence: a project written and read back', () => {
  it('has the demo, the sample, the starters and the whole stress list', () => {
    expect(all.length).toBeGreaterThan(190)
    expect(starters.length).toBeGreaterThan(0)
  })

  it('only the ring off scenario carries a field of version 10 (no field of the project)', () => {
    expect(all.filter((s) => s.project.options.some((o) => Object.keys(o).some((k) => LEGACY.includes(k)))).map((s) => s.name)).toEqual(['ring off'])
  })

  it('every project reads back from its .gft equal to what went in', () => {
    for (const s of all) expect(viaGft(s.project), s.name).toEqual(onDisk(s.project))
  })

  it('reading is stable: a second trip is the identity', () => {
    for (const s of all) {
      const once = viaGft(s.project)
      expect(viaGft(once), s.name).toEqual(once)
      expect(writeGft(viaGft(once)), s.name).toBe(writeGft(once))
    }
  })

  it('every project comes back from the library as written, with its option', () => {
    for (const s of all) {
      const option = s.project.options[0].id
      expect(library.write(s.project, option, 1234), s.name).toBe(true)
      const kept = library.read(s.project.id)
      expect(kept?.project, s.name).toEqual(onDisk(s.project))
      expect(kept?.option, s.name).toBe(option)
      library.remove(s.project.id)
    }
  })

  it('the padlocks of a street, a lot, a gate and a building survive the .gft and the browser’s copy', () => {
    const o1 = 'o1'
    let p = demoProject()
    const lot = actions.addLot(p, o1, { rect: { center: { x: 200, y: 230 }, width: 30, depth: 20, rotation: 0 } })!
    p = lot.project
    const segments = p.options[0].streets!.segments.map((g) => g.id)
    p = actions.lockStreets(p, segments.slice(0, 2), true, 'o1')
    p = actions.lockLots(p, [lot.id], true)
    p = actions.lockGates(p, [p.site.gates![0].id], true, o1)
    p = actions.lockBuildings(p, ['b1'], true)
    const back = viaGft(p)
    expect(back.buildings[0].locked).toBe(true)
    expect(back.site.gates![0].locked).toBe(true)
    expect(back.options[0].lots![0].locked).toBe(true)
    expect(back.options[0].streets!.segments.filter((g) => g.locked).map((g) => g.id)).toEqual(segments.slice(0, 2))
    expect(back).toEqual(onDisk(p))
    library.write(p, o1, 1)
    expect(library.read(p.id)!.project).toEqual(onDisk(p))
    library.remove(p.id)
  })

  it('the plugin data and the log of the demo survive whole', () => {
    const p = demoWithExtras()
    const back = viaGft(p)
    expect(back.plugins).toEqual(p.plugins)
    expect(back.log).toEqual(p.log)
    library.write(p, p.options[0].id, 1)
    expect(library.read(p.id)!.project.plugins).toEqual(p.plugins)
    expect(library.read(p.id)!.project.log).toEqual(p.log)
  })
})
