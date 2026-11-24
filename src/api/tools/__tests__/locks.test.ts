// The padlock of a street, a lot, a gate and a building, for the agent's tools (Phase AS.4 task 2, Decision "Padlocks by kind"): the tools
// that change one refuse a locked one in the mass's words ("<name> is locked: unlock it (<tool>) to change it."), and tools lock and
// free them as lockMasses does. A mass of a locked building is a locked mass for every tool.
import { describe, expect, it } from 'vitest'
import { addLot } from '../../../modules/parking/actions.ts'
import { addBuilding, assignMasses, duplicateOption } from '../../../state/actions/buildings.ts'
import { addGate } from '../../../state/actions/circulation.ts'
import { drawStreet } from '../../../state/actions/streets.ts'
import { demoProject } from '../../../state/demo.ts'
import type { Project } from '../../../model/schema.ts'
import { callTool, toolSchemas } from '../index.ts'

const o1 = 'o1'
const option = (p: Project) => p.options.find((o) => o.id === o1)!
const error = (r: ReturnType<typeof callTool>) => (r.ok ? null : r.error)

describe('the lock tools', () => {
  it('are listed, each with a schema', () => {
    const names = toolSchemas().map((t) => t.name)
    for (const n of ['lockStreets', 'lockLots', 'lockGates', 'lockBuildings']) expect(names, n).toContain(n)
  })

  it('lockStreets locks and frees street segments', () => {
    const r = drawStreet(demoProject({ streets: false }), o1, [{ x: 260, y: 240 }, { x: 380, y: 240 }])!
    const on = callTool(r.project, 'lockStreets', { segments: r.segments, locked: true })
    expect(on.ok && on.changed).toBe(true)
    const p = on.ok ? on.project : r.project
    expect(option(p).streets!.segments.every((g) => g.locked === true)).toBe(true)
    const off = callTool(p, 'lockStreets', { segments: r.segments, locked: false })
    expect(off.ok && off.project.options[0].streets!.segments.every((g) => g.locked === undefined)).toBe(true)
    expect(error(callTool(r.project, 'lockStreets', { segments: ['nope'], locked: true }))).toMatch(/No street segment "nope"/)
  })

  it('lockStreets locks the segments of the option asked, and only that one’s (a copy of the option has the same ids)', () => {
    const r = drawStreet(demoProject({ streets: false }), o1, [{ x: 260, y: 240 }, { x: 380, y: 240 }])!
    const d = duplicateOption(r.project, o1)!
    const on = callTool(d.project, 'lockStreets', { segments: r.segments, locked: true, option: d.id })
    const q = on.ok ? on.project : d.project
    expect(q.options.find((o) => o.id === d.id)!.streets!.segments.every((g) => g.locked === true)).toBe(true)
    expect(option(q).streets!.segments.some((g) => g.locked)).toBe(false)
  })

  it('lockGates locks and frees a gate of the option', () => {
    const p = demoProject()
    const id = p.site.gates![0].id
    const on = callTool(p, 'lockGates', { gates: [id], locked: true })
    expect(on.ok && on.project.site.gates![0].locked).toBe(true)
    expect(error(callTool(p, 'lockGates', { gates: ['nope'], locked: true }))).toMatch(/No gate "nope"/)
  })

  it('lockLots and lockBuildings', () => {
    const lot = addLot(demoProject({ streets: false }), o1, { rect: { center: { x: 200, y: 220 }, width: 30, depth: 20, rotation: 0 } })!
    const on = callTool(lot.project, 'lockLots', { lots: [lot.id], locked: true })
    expect(on.ok && option(on.project).lots![0].locked).toBe(true)
    const b = callTool(demoProject(), 'lockBuildings', { buildings: ['b1'], locked: true })
    expect(b.ok && b.project.buildings[0].locked).toBe(true)
    expect(error(callTool(demoProject(), 'lockBuildings', { buildings: ['nope'], locked: true }))).toMatch(/No building "nope"/)
  })
})

describe('a locked one is refused in the mass’s words', () => {
  it('a street segment', () => {
    const r = drawStreet(demoProject({ streets: false }), o1, [{ x: 260, y: 240 }, { x: 380, y: 240 }])!
    const p = (callTool(r.project, 'lockStreets', { segments: r.segments, locked: true }) as { project: Project }).project
    const seg = r.segments[0]
    const form = new RegExp(`Street segment ${seg} is locked: unlock it \\(lockStreets\\) to change it\\.`)
    expect(error(callTool(p, 'removeStreet', { segments: [seg] }))).toMatch(form)
    expect(error(callTool(p, 'setStreetType', { segments: [seg], type: 'cars' }))).toMatch(form)
    expect(error(callTool(p, 'moveStreet', { segments: [seg], dx: 5, dy: 0 }))).toMatch(form)
    expect(error(callTool(p, 'moveStreetNode', { node: r.nodes[0], x: 5, y: 5 }))).toMatch(form)
    expect(error(callTool(p, 'setStreetParking', { segments: [seg], side: 'left' }))).toMatch(form)
  })

  it('a gate', () => {
    const p = (callTool(demoProject(), 'lockGates', { gates: ['g1'], locked: true }) as { project: Project }).project
    const id = p.site.gates![0].id
    const form = new RegExp(`Gate ${id} is locked: unlock it \\(lockGates\\) to change it\\.`)
    expect(error(callTool(p, 'updateGate', { gate: id, width: 12 }))).toMatch(form)
    expect(error(callTool(p, 'removeGate', { gate: id }))).toMatch(form)
    // another gate is not held
    const two = addGate(p, o1, 0.6)
    expect(callTool(two.project, 'removeGate', { gate: two.id }).ok).toBe(true)
  })

  it('a lot', () => {
    const lot = addLot(demoProject({ streets: false }), o1, { rect: { center: { x: 200, y: 220 }, width: 30, depth: 20, rotation: 0 } })!
    const p = (callTool(lot.project, 'lockLots', { lots: [lot.id], locked: true }) as { project: Project }).project
    const name = option(p).lots![0].name
    const form = new RegExp(`${name} is locked: unlock it \\(lockLots\\) to change it\\.`)
    expect(error(callTool(p, 'updateParkingLot', { lot: lot.id, sizes: null, rows: 2 }))).toMatch(form)
    expect(error(callTool(p, 'removeParkingLots', { lots: [lot.id] }))).toMatch(form)
  })

  it('a building: its data, its levels and its masses', () => {
    const made = addBuilding(demoProject(), { name: 'Annex', optionId: o1 })
    const p0 = assignMasses(made.project, ['m3'], made.id)
    const p = (callTool(p0, 'lockBuildings', { buildings: [made.id], locked: true }) as { project: Project }).project
    const form = /Annex is locked: unlock it \(lockBuildings\) to change it\./
    expect(error(callTool(p, 'updateBuilding', { building: made.id, name: 'Other' }))).toMatch(form)
    expect(error(callTool(p, 'removeBuilding', { building: made.id, withMasses: true }))).toMatch(form)
    const level = p.buildings.find((b) => b.id === made.id)!.levels[0].id
    expect(error(callTool(p, 'updateLevel', { level, name: 'Ground' }))).toMatch(form)
    expect(error(callTool(p, 'removeLevel', { level }))).toMatch(form)
    // a mass of it is a locked mass, in the mass's tools' words
    expect(error(callTool(p, 'groupMasses', { masses: ['m3', 'm1'] }))).toMatch(/is locked: unlock it \(lockMasses\)/)
    expect(error(callTool(p, 'updateMass', { mass: 'm3', name: 'X' }))).toMatch(/is locked: unlock it \(lockMasses\) to change its name or its program\./)
    expect(callTool(p, 'updateBuilding', { building: 'b1', name: 'Main' }).ok).toBe(true)
  })

  it('lockMasses, freeing a mass of a locked building, says it is held by the building and which tool frees it', () => {
    const made = addBuilding(demoProject(), { name: 'Annex', optionId: o1 })
    const p = (callTool(assignMasses(made.project, ['m3'], made.id), 'lockBuildings', { buildings: [made.id], locked: true }) as { project: Project }).project
    const name = p.masses.find((m) => m.id === 'm3')!.name
    expect(error(callTool(p, 'lockMasses', { masses: ['m3'], locked: false }))).toBe(`${name} is locked with its building: unlock Annex (lockBuildings) to unlock it.`)
    // locking it, or freeing a mass of a free building, is as it was
    expect(callTool(p, 'lockMasses', { masses: ['m3'], locked: true }).ok).toBe(true)
    expect(callTool(demoProject(), 'lockMasses', { masses: ['m1'], locked: false }).ok).toBe(true)
  })
})
