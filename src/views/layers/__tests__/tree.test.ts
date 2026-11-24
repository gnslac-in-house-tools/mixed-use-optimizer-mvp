// The Layers tree's rows (Phase AS.3, task 4), pure: which rows a project has, in which branch, with which count, padlock
// and eyes; what is left out when it has nothing; ids that never repeat; the eyes of a branch covering those of its leaves.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import type { Contour, Id, Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { sampleProject } from '../../../state/sample.ts'
import { newProject } from '../../../typologies/index.ts'
import { addOption } from '../../../state/actions/buildings.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { COURTS, DIMENSIONS, drawingLayer, existingRoad, EXISTING_ROADS, gate, GATES, lot, LOTS, MAP, parcel, STREET_PARKING, STREETS } from '../keys.ts'
import { eyeKeys, eyeState, eyeSwitches, flatRows, foldedByDefault, layerTree, lockOf, type Has, type LayerRow, type SwitchName } from '../tree.ts'

const ALL: Has = { terrain: true, parking: true }
const ON: Record<SwitchName, boolean> = { grid: true, terrain: true, graph: true }
const tree = (p: Project, option = 'o1', has: Has = ALL) => layerTree(p, option, derive(p, option), has)
const find = (rows: LayerRow[], id: string): LayerRow | undefined => flatRows(rows).find((r) => r.id === id)
const get = (rows: LayerRow[], id: string): LayerRow => {
  const r = find(rows, id)
  if (!r) throw new Error(`no row ${id}: ${flatRows(rows).map((x) => x.id).join(', ')}`)
  return r
}
const labels = (r: LayerRow | undefined) => (r?.children ?? []).map((c) => c.label)
const sq = (x: number, s: number): Contour => ({ vertices: [{ x, y: 0, r: 0 }, { x: x + s, y: 0, r: 0 }, { x: x + s, y: s, r: 0 }, { x, y: s, r: 0 }] })
const line = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }

/** The demo with two drawing files (one with parcels), a parcel of a third file that has no drawing, a loose parcel. */
function withDrawings(): Project {
  const p = demoProject()
  return {
    ...p,
    site: {
      ...p.site,
      drawings: [
        { file: 'civil.dwg', layers: [{ name: 'A-SITE', color: 1, lines: [line, line] }, { name: 'C-ROAD', lines: [line], locked: true }] },
        { file: 'frisa.dwg', layers: [{ name: 'ARQ-EDIF', color: 3, lines: [line] }], split: true },
      ],
      parcels: [
        { name: 'P1', contour: sq(0, 20), file: 'civil.dwg' },
        { name: 'P2', contour: sq(30, 10), file: 'civil.dwg', unlocked: true },
        { name: 'P3', contour: sq(50, 10), file: 'only-parcels.dwg' },
        { name: 'Loose', contour: sq(70, 10) },
      ],
    },
  }
}

/** The demo (its south street the first existing road) with two more existing roads, a second gate and two lots. */
function withAccess(): Project {
  let p = demoProject()
  p = actions.addGate(p, 'o1', 0.1).project
  p = actions.addExistingRoad(p, [{ x: -60, y: 310 }, { x: 500, y: 310 }], 12)!.project
  p = actions.addExistingRoad(p, [{ x: -60, y: 340 }, { x: 500, y: 340 }], 12)!.project
  p = actions.addLot(p, 'o1', { rect: { center: { x: 380, y: 230 }, width: 50, depth: 24, rotation: 0 } })!.project
  p = actions.addLot(p, 'o1', { rect: { center: { x: 260, y: 240 }, width: 50, depth: 24, rotation: 0 } })!.project
  return p
}

describe('the branches, for the demo', () => {
  const p = demoProject()
  const rows = tree(p)

  it('Site, Buildings, Circulation, Parking and Annotations, in that order; no Reference without a grid, nothing it has not', () => {
    const top = rows.map((r) => r.id)
    expect(top).toEqual(expect.arrayContaining(['site', 'buildings', 'circulation', 'annotations']))
    expect(top.indexOf('site')).toBeLessThan(top.indexOf('buildings'))
    expect(top.indexOf('buildings')).toBeLessThan(top.indexOf('circulation'))
    expect(top[top.length - 1]).toBe('annotations')
    // no terrain, no map, no drawings files: their rows are not there; Drawings is (the site has a boundary), empty
    expect(find(rows, 'terrain')).toBeUndefined()
    expect(find(rows, 'map')).toBeUndefined()
    expect(get(rows, 'drawings').children).toBeUndefined()
    expect(find(rows, 'courts')?.kind ?? 'courts').toBe('courts')
  })

  it('Site: Boundary, Buildable area, Drawings', () => {
    expect(labels(get(rows, 'site'))).toEqual(['Boundary', 'Buildable area', 'Drawings'])
  })

  it('Buildings: a building of the option ▸ its levels ▸ its masses, with counts', () => {
    const b = get(rows, 'building:b1')
    expect(b.kind).toBe('building')
    expect(b.count).toBe(p.masses.length)
    expect(b.swatch).toBe(p.buildings[0].color)
    expect(labels(b)).toEqual(p.buildings[0].levels.map((l) => l.name).reverse())
    const level = get(rows, `level:${p.buildings[0].levels[0].id}`)
    expect(level.count).toBe(p.masses.filter((m) => m.levelId === level.ref!.level).length)
    expect(labels(level)).toEqual(p.masses.filter((m) => m.levelId === level.ref!.level).map((m) => m.name))
    // a mass has an eye of its own (Phase AS.4: Hide for one object), which reads hidden while its building's is; a level's holds its masses', a building's its own and theirs
    expect(get(rows, 'mass:m1').eyes).toEqual([{ key: 'mass:m1', via: 'building:b1' }])
    expect(get(rows, 'mass:m1').underBuilding).toBe('b1')
    expect(get(rows, 'buildings').count).toBe(1)
  })

  it('Circulation: Streets with their count, Gates, the south street an existing road and no Frontage; the court row only with courts', () => {
    const d = derive(p, 'o1')
    expect(get(rows, 'streets').count).toBe(new Set(d.circulation.roads.filter((r) => r.kind === 'street').map((r) => r.street ?? r.id)).size)
    expect(get(rows, 'gates').count).toBe(1)
    expect(labels(get(rows, 'gates'))).toEqual(['Gate 1'])
    expect(labels(get(rows, 'existing-roads'))).toEqual(['South street'])
    expect(find(rows, 'frontage')).toBeUndefined()
    expect(!!find(rows, 'courts')).toBe(d.circulation.docks.some((x) => x.court.length >= 3))
  })

  it('Annotations: Dimensions, Labels, Notes, Issues (their count), Rules, Program graph', () => {
    expect(labels(get(rows, 'annotations'))).toEqual(['Dimensions', 'Labels', 'Notes', 'Issues', 'Rules', 'Program graph'])
    expect(get(rows, 'issues').count).toBe(derive(p, 'o1').issues.length)
    expect(get(rows, 'dimensions').count).toBe(0)
  })

  it('the Parking branch is there for a typology that offers the module and has lots or street stalls', () => {
    const q = withAccess()
    expect(labels(get(tree(q), 'parking'))).toContain('Lots')
    expect(find(tree(q, 'o1', { ...ALL, parking: false }), 'parking')).toBeUndefined()
    expect(find(tree(q, 'o1', { ...ALL, parking: false }), 'lots')).toBeUndefined()
  })

  it('Parking (with Street parking) is there whenever the typology offers the module, with a count of 0: Other streets lives in its Properties', () => {
    const base = demoProject()
    const p = { ...base, standards: { ...base.standards, parking: 'none' as const } }
    const d = derive(p, 'o1')
    expect(d.circulation.stalls).toHaveLength(0)
    expect(d.circulation.lots).toHaveLength(0)
    const rows = tree(p)
    expect(labels(get(rows, 'parking'))).toEqual(['Street parking'])
    expect(get(rows, 'street-parking').count).toBe(0)
    expect(get(rows, 'street-parking').eyes).toEqual([{ key: STREET_PARKING }])
    expect(find(tree(p, 'o1', { ...ALL, parking: false }), 'parking')).toBeUndefined()
  })

  it('Gates is there whenever the site has a boundary, with a count of 0: Own gates and + Gate live in its Properties', () => {
    const base = demoProject()
    const p = { ...base, site: { boundary: base.site.boundary, rules: base.site.rules } }
    expect(gatesOf(p, 'o1')).toHaveLength(0)
    const row = get(tree(p), 'gates')
    expect(row.count).toBe(0)
    expect(row.children).toBeUndefined()
    expect(row.eyes).toEqual([{ key: GATES }])
    expect(labels(get(tree(p), 'circulation'))).toContain('Gates')
    // no boundary, no gates: left out
    expect(find(tree({ ...p, site: { boundary: null, rules: p.site.rules } }), 'gates')).toBeUndefined()
  })
})

describe('what a project has, and what it has not', () => {
  it('a blank project shows Reference (it has its grid), Buildings and Annotations; Site, with no boundary, has no rows and is left out', () => {
    const p = newProject('blank', 'Blank')
    const rows = tree(p, p.options[0].id)
    // Parking: the typology offers the module, so its Street parking row is there with nothing in it
    expect(rows.map((r) => r.id)).toEqual(['reference', 'buildings', 'parking', 'annotations'])
    expect(tree(p, p.options[0].id, { ...ALL, parking: false }).map((r) => r.id)).toEqual(['reference', 'buildings', 'annotations'])
  })

  it('a site with a boundary lists Boundary; Site is left out when it has nothing at all', () => {
    const p = newProject('blank', 'Blank')
    expect(find(tree(p, p.options[0].id), 'site')).toBeUndefined()
    const q = demoProject()
    expect(labels(get(tree(q), 'site'))).toContain('Boundary')
  })

  it('the ground and the map: Terrain with the module on and ground, Map with a map under the plan', () => {
    const p = sampleProject()
    const rows = tree(p, p.options[0].id)
    expect(labels(get(rows, 'site'))).toContain('Terrain')
    expect(get(rows, 'terrain').eyes).toEqual([{ switch: 'terrain' }])
    expect(find(tree(p, p.options[0].id, { ...ALL, terrain: false }), 'terrain')).toBeUndefined()
    const m: Project = { ...demoProject() }
    m.site = { ...m.site, map: { source: 'street', center: { lat: 1, lon: 1 }, radius: 100, zoom: 17, image: 'x' } as never }
    expect(get(tree(m), 'map').eyes).toEqual([{ key: MAP }])
  })

  it('Grid is in Reference when the project has a grid', () => {
    const p = demoProject()
    expect(!!p.grid).toBe(true)
    expect(get(tree(p), 'grid').eyes).toEqual([{ switch: 'grid' }])
    expect(find(tree({ ...p, grid: undefined }), 'grid')).toBeUndefined()
    expect(find(tree({ ...p, grid: undefined }), 'reference')).toBeUndefined()
  })

  it('the tree is the option in view: each option shows its own buildings, in its order', () => {
    const p = sampleProject()
    for (const o of p.options) {
      const rows = tree(p, o.id)
      const ids = (get(rows, 'buildings').children ?? []).map((r) => r.id)
      expect(ids).toEqual(o.buildingIds.map((id) => `building:${id}`))
    }
    const two = addOption(demoProject(), { buildingIds: ['b1'] })
    expect(get(tree(two.project, two.id), 'buildings').count).toBe(1)
  })
})

describe('drawings', () => {
  const p = withDrawings()
  const rows = tree(p)

  it('a file ▸ its layers (with their colour) and its Parcels ▸ each parcel; a file with only parcels has a group; a loose parcel sits apart', () => {
    const drawings = get(rows, 'drawings')
    expect(drawings.count).toBe(3)
    expect(labels(drawings)).toEqual(['civil.dwg', 'frisa.dwg', 'only-parcels.dwg', 'Parcels'])
    expect(labels(get(rows, 'file:civil.dwg'))).toEqual(['A-SITE', 'C-ROAD', 'Parcels'])
    expect(get(rows, 'layer:civil.dwg/A-SITE').swatch).toBe('rgb(255 0 0)')
    expect(get(rows, 'layer:civil.dwg/A-SITE').count).toBe(2)
    expect(labels(get(rows, 'parcels:civil.dwg'))).toEqual(['P1', 'P2'])
    expect(labels(get(rows, 'file:only-parcels.dwg'))).toEqual(['Parcels'])
    expect(labels(get(rows, 'parcels:'))).toEqual(['Loose'])
    expect(get(rows, 'parcel:civil.dwg/P1').detail).toBe('400 m²')
  })

  it('a layer’s eye is its key, a file’s are its layers’ and parcels’, the Drawings row’s every file’s', () => {
    expect(get(rows, 'layer:civil.dwg/A-SITE').eyes).toEqual([{ key: drawingLayer('civil.dwg', 'A-SITE') }])
    expect(eyeKeys(get(rows, 'file:civil.dwg').eyes).sort()).toEqual(
      [drawingLayer('civil.dwg', 'A-SITE'), drawingLayer('civil.dwg', 'C-ROAD'), parcel('P1', 'civil.dwg'), parcel('P2', 'civil.dwg')].sort(),
    )
    expect(eyeKeys(get(rows, 'drawings').eyes)).toHaveLength(3 + 4)
    expect(eyeKeys(get(rows, 'parcels:').eyes)).toEqual([parcel('Loose')])
  })

  it('the padlock: a layer’s own; a file’s parcels all, some (mixed) or none; a file’s is its layers’ and parcels’ together', () => {
    expect(get(rows, 'layer:civil.dwg/A-SITE').lock).toBe('unlocked')
    expect(get(rows, 'layer:civil.dwg/C-ROAD').lock).toBe('locked')
    expect(get(rows, 'parcels:civil.dwg').lock).toBe('mixed')
    expect(get(rows, 'parcels:only-parcels.dwg').lock).toBe('locked')
    expect(get(rows, 'file:civil.dwg').lock).toBe('mixed')
    expect(get(rows, 'file:only-parcels.dwg').lock).toBe('locked')
    expect(get(rows, 'file:frisa.dwg').lock).toBe('unlocked')
    // the loose parcels have none, and the Drawings row aggregates the files
    expect(get(rows, 'parcels:').lock).toBeUndefined()
    expect(get(rows, 'drawings').lock).toBe('mixed')
  })

  it('Drawings is there with no file when the site has a boundary (its ＋ brings one), and not without a boundary', () => {
    expect(find(tree(demoProject()), 'drawings')).toBeDefined()
    const p0 = newProject('blank', 'Blank')
    expect(find(tree(p0, p0.options[0].id), 'drawings')).toBeUndefined()
  })
})

describe('access and parking', () => {
  const p = withAccess()
  const rows = tree(p)
  const d = derive(p, 'o1')

  it('existing roads, gates and lots: a row each with their kind’s count; the object’s eye hides it and its kind hides it too', () => {
    expect(get(rows, 'existing-roads').count).toBe(3)
    expect(get(rows, 'gates').count).toBe(2)
    expect(get(rows, 'lots').count).toBe(2)
    const id = p.site.existingRoads![0].id
    expect(get(rows, `existing-road:${id}`).eyes).toEqual([{ key: existingRoad(id), via: EXISTING_ROADS }])
    expect(get(rows, `gate:${p.site.gates![0].id}`).eyes).toEqual([{ key: gate(p.site.gates![0].id), via: GATES }])
    expect(get(rows, `lot:${d.circulation.lots[0].id}`).eyes).toEqual([{ key: lot(d.circulation.lots[0].id), via: LOTS }])
    expect(labels(get(rows, 'existing-roads'))).toEqual(['South street', 'Existing road 2', 'Existing road 3'])
    expect(labels(get(rows, 'lots'))).toEqual(d.circulation.lots.map((l) => l.name))
    // a kind's eye covers its own key and every object's
    expect(eyeKeys(get(rows, 'gates').eyes)).toEqual([GATES, ...p.site.gates!.map((g) => gate(g.id))])
  })

  it('street parking with its stalls’ count, and no row for a kind that is not there', () => {
    expect(get(rows, 'street-parking').count).toBe(d.circulation.stalls.length)
    const q = { ...demoProject(), site: { ...demoProject().site, existingRoads: undefined } }
    for (const id of ['existing-roads', 'lots']) expect(find(tree(q), id)).toBeUndefined()
  })

  it('the gates of the option in view: an option with its own gates lists those', () => {
    let q = demoProject()
    const o2 = addOption(q, { buildingIds: ['b1'] })
    q = actions.ownGates(o2.project, o2.id)
    q = actions.addGate(q, o2.id, 0.7).project
    expect(get(tree(q, o2.id), 'gates').count).toBe(2)
    expect(get(tree(q, 'o1'), 'gates').count).toBe(1)
  })

  it('truck courts: a row with their count when the option has docks with a court', () => {
    const s = sampleProject()
    const o = s.options[0].id
    const rows2 = tree(s, o)
    const courts = derive(s, o).circulation.docks.filter((x) => x.court.length >= 3).length
    expect(courts).toBeGreaterThan(0)
    expect(get(rows2, 'courts').count).toBe(courts)
    expect(get(rows2, 'courts').eyes).toEqual([{ key: COURTS }])
  })
})

describe('the padlock of the masses', () => {
  it('a mass and a level read locked, unlocked or mixed from their masses; a building from its own flag (mixed while the flag is off and some of its masses are locked); Buildings from the buildings', () => {
    const p = demoProject()
    const locked = actions.lockMasses(p, ['m1'], true)
    const rows = tree(locked)
    expect(get(rows, 'mass:m1').lock).toBe('locked')
    expect(get(rows, 'mass:m2').lock).toBe('unlocked')
    const lv = p.masses[0].levelId
    expect(get(rows, `level:${lv}`).lock).toBe('mixed')
    expect(get(rows, 'building:b1').lock).toBe('mixed')
    expect(get(rows, 'buildings').lock).toBe('mixed')
    // every mass locked one by one: the building's flag is still off, so it reads mixed; its level reads locked
    const all = tree(actions.lockMasses(p, p.masses.map((m) => m.id), true))
    expect(get(all, 'building:b1').lock).toBe('mixed')
    expect(get(all, `level:${lv}`).lock).toBe('locked')
    // its own flag: locked, and so is Buildings (every building of the option)
    const flagged = tree(actions.lockBuildings(p, ['b1'], true))
    expect(get(flagged, 'building:b1').lock).toBe('locked')
    expect(get(flagged, 'buildings').lock).toBe('locked')
    expect(get(flagged, 'mass:m1').lock).toBe('locked')
    expect(get(tree(p), 'building:b1').lock).toBe('unlocked')
  })

  it('a level with no masses has no padlock', () => {
    const p = actions.addLevel(demoProject(), { name: 'L9', elevation: 40, height: 4, repeat: 1 }, 'b1')!.project
    const rows = tree(p)
    const empty = flatRows(rows).filter((r) => r.kind === 'level' && r.count === 0)
    expect(empty.length).toBeGreaterThan(0)
    expect(empty.every((r) => r.lock === undefined)).toBe(true)
  })

  it('lockOf', () => {
    expect(lockOf([])).toBeUndefined()
    expect(lockOf([true, true])).toBe('locked')
    expect(lockOf([false, false])).toBe('unlocked')
    expect(lockOf([true, false])).toBe('mixed')
  })
})

describe('ids, eyes and folds', () => {
  const projects: [string, () => { p: Project; option: Id }][] = [
    ['the demo', () => ({ p: demoProject(), option: 'o1' })],
    ['access and lots', () => ({ p: withAccess(), option: 'o1' })],
    ['drawings', () => ({ p: withDrawings(), option: 'o1' })],
    ['the sample', () => ({ p: sampleProject(), option: sampleProject().options[0].id })],
  ]
  for (const [name, make] of projects) {
    it(`${name}: every id is unique, and a branch’s eyes cover every leaf’s keys, and no switch`, () => {
      const { p, option } = make()
      const rows = tree(p, option)
      const all = flatRows(rows)
      const ids = all.map((r) => r.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const r of all) {
        const under = flatRows(r.children ?? []).flatMap((c) => c.eyes)
        for (const e of under) {
          if ('key' in e) expect(r.eyes, `${r.id} covers`).toContainEqual(e)
          else expect(r.eyes, `${r.id} leaves the switch ${e.switch} to its own row`).not.toContainEqual(e)
        }
      }
    })
  }

  it('two parcels with one name in one file get two ids', () => {
    const p = withDrawings()
    p.site.parcels!.push({ name: 'P1', contour: sq(90, 5), file: 'civil.dwg' })
    const ids = flatRows(tree(p)).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the eye’s state: shown, hidden or mixed; the switches read what they run; a row with no eye has none', () => {
    const rows = tree(withAccess())
    const gates = get(rows, 'gates')
    expect(eyeState(gates.eyes, new Set(), ON)).toBe('shown')
    expect(eyeState(gates.eyes, new Set([GATES]), ON)).toBe('hidden')
    const own = eyeKeys(gates.eyes)[1]
    expect(eyeState(gates.eyes, new Set([own]), ON)).toBe('mixed')
    // the object's state reads its kind's key too
    expect(eyeState(get(rows, `gate:${own.replace('gate:', '')}`).eyes, new Set([GATES]), ON)).toBe('hidden')
    expect(eyeState(get(rows, 'grid').eyes, new Set(), { ...ON, grid: false })).toBe('hidden')
    expect(eyeSwitches(get(rows, 'annotations').eyes)).toEqual([])
    expect(eyeSwitches(get(rows, 'graph').eyes)).toEqual(['graph'])
    // a level's eye holds its masses' (which read hidden while their building's key is)
    const level = get(rows, `level:${demoProject().masses[0].levelId}`)
    expect(eyeState(level.eyes, new Set(), ON)).toBe('shown')
    expect(eyeState(level.eyes, new Set(['building:b1']), ON)).toBe('hidden')
    expect(eyeState(level.eyes, new Set(['mass:m1']), ON)).toBe('mixed')
    expect(eyeState(get(rows, 'boundary').eyes, new Set(), ON)).toBe('shown')
    expect(eyeState([], new Set(), ON)).toBeNull()
    expect(eyeState(get(rows, 'dimensions').eyes, new Set([DIMENSIONS]), ON)).toBe('hidden')
    expect(eyeState(get(rows, 'streets').eyes, new Set([STREETS]), ON)).toBe('hidden')
  })

  it('folded at first: Buildings alone is open', () => {
    const rows = tree(withDrawings())
    const folded = flatRows(rows).filter((r) => foldedByDefault(r))
    expect(folded.length).toBeGreaterThan(0)
    expect(foldedByDefault(get(rows, 'buildings'))).toBe(false)
    expect(foldedByDefault(get(rows, 'site'))).toBe(true)
    expect(foldedByDefault(get(rows, 'building:b1'))).toBe(true)
    expect(foldedByDefault(get(rows, 'boundary'))).toBe(false)
  })
})

// What the old tabs said of each thing in their lists, now a quiet word after the row's name (Phase AS.3, task 6): a gate its width, a
// an existing road its length and width, a lot its wall and rows (or "Free") with its stalls as its count, a
// level its elevation; and the marks of a building: linked to other options, context.
describe('what a row says besides its name', () => {
  const p = withAccess()
  const d = derive(p, 'o1')
  const rows = tree(p)

  it('a gate its width, an existing road its length and its width', () => {
    const g = p.site.gates![0]
    expect(get(rows, `gate:${g.id}`).detail).toBe(`${Math.round(g.width * 100) / 100} m`)
    const road = p.site.existingRoads![1]
    expect(get(rows, `existing-road:${road.id}`).detail).toBe('560 m · 12 m wide')
  })

  it('a lot "Rear wall · 2 rows" or "Free", with its stalls as its count', () => {
    const lots = d.circulation.lots
    expect(lots.length).toBeGreaterThan(1)
    for (const l of lots) {
      const row = get(rows, `lot:${l.id}`)
      expect(row.count).toBe(l.stalls.length)
      expect(row.detail).toBe(l.anchor ? `${l.anchor.facing[0].toUpperCase()}${l.anchor.facing.slice(1)} wall · ${l.rows} ${l.rows === 1 ? 'row' : 'rows'}` : 'Free')
    }
    expect(lots.some((l) => get(rows, `lot:${l.id}`).detail === 'Free')).toBe(true)
  })

  it('a level its elevation', () => {
    const q = demoProject()
    const level = q.buildings[0].levels[0]
    expect(get(tree(q), `level:${level.id}`).detail).toBe('0 m')
    const up = actions.addLevelAtEnd(q, 'above')
    expect(get(tree(up.project), `level:${up.id}`).detail).toBe(`${up.project.buildings[0].levels.find((l) => l.id === up.id)!.elevation} m`)
  })

  it('a building linked into another option says linked; a context one says context; one that is neither has no mark', () => {
    let q = demoProject()
    expect(get(tree(q), 'building:b1').marks).toBeUndefined()
    const o2 = addOption(q, { name: 'Second', buildingIds: ['b1'] })
    q = actions.updateBuilding(o2.project, 'b1', { context: true })
    const marks = get(tree(q), 'building:b1').marks!
    expect(marks.map((m) => m.label)).toEqual(['linked', 'context'])
    expect(marks[0].title).toBe('Linked: the same building in Option 1, Second')
    expect(marks[1].title).toMatch(/^Context/)
    // the other option sees the same building, linked
    expect(get(tree(q, o2.id), 'building:b1').marks!.map((m) => m.label)).toEqual(['linked', 'context'])
  })
})
