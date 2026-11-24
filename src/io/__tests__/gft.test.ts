// The .gft file: what goes out comes back the same; anything else is refused with a reason. The file name tests are
// ported from Plaza-Practiko `vistas/paneles/__tests__/nombresArchivo.test.ts`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { fileName, fileSegment, readGft, writeGft } from '../gft.ts'

describe('readGft / writeGft', () => {
  it('the starter opens (Phase D.2: it has no free mass to migrate)', () => {
    const r = readGft(readFileSync('src/state/starters/industrial-quezaltepeque-demo.gft', 'utf8'))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.project.version).toBe(20)
    expect(r.ok && r.notes).toBeFalsy()
  })

  it('a written project reads back equal, with the header first', () => {
    const p = demoProject()
    const text = writeGft(p)
    expect(JSON.parse(text)).toMatchObject({ format: 'gfit', version: 20, name: 'Demo site' })
    expect(Object.keys(JSON.parse(text))[0]).toBe('format')
    expect(readGft(text)).toEqual({ ok: true, project: p })
  })

  it('a project with reference lines and notes reads back equal (Phase AS.5)', () => {
    const p = actions.addNote(actions.addReferenceLine(demoProject(), [{ x: 0, y: 0 }, { x: 10, y: 0 }])!.project, { x: 5, y: 5 }, 'Fire lane')!.project
    const q = actions.lockNotes(actions.setNoteSize(p, 't1', 'large'), ['t1'], true)
    expect(q.referenceLines).toHaveLength(1)
    expect(readGft(writeGft(q))).toEqual({ ok: true, project: q })
  })

  it('a version 15 file opens at 18: its free masses are blocks, as a version 16 file’s are (Phase D.2)', () => {
    const file = JSON.parse(writeGft(demoProject()))
    const v16 = readGft(JSON.stringify({ ...file, version: 16 }))
    const v15 = readGft(JSON.stringify({ ...file, version: 15 }))
    expect(v15.ok && v16.ok).toBe(true)
    expect(v15).toEqual(v16)
    if (v15.ok) expect(v15.project.masses.every((m) => m.part === 'hall')).toBe(true)
  })

  it('a version 16 file with free masses reads them as blocks and returns the report; one without, or a version 17 file, no report', () => {
    const p = demoProject()
    const v16 = readGft(JSON.stringify({ ...JSON.parse(writeGft(p)), version: 16 }))
    expect(v16.ok).toBe(true)
    if (!v16.ok) return
    expect(v16.notes?.[0]).toContain('3 masses are blocks now (2 new block types: Warehouse, Office).')
    // what comes out is a v17 file: it reads back the same, with no report
    const again = readGft(writeGft(v16.project))
    expect(again).toEqual({ ok: true, project: v16.project })
    const none = readGft(JSON.stringify({ ...JSON.parse(writeGft({ ...p, masses: [] })), version: 16 }))
    expect(none.ok && none.notes).toBeFalsy()
    const now = readGft(writeGft(p))
    expect(now.ok && now.notes).toBeFalsy()
  })

  it('a chamfer on a corner is kept by the file (Phase D.1)', () => {
    const p = demoProject()
    const m = p.masses[0]
    const contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 40, y: 0, r: 0, chamfer: [2, 3] as [number, number] }, { x: 40, y: 30, r: 0 }, { x: 0, y: 30, r: 0 }] }
    const q = { ...p, masses: [{ ...m, footprint: { kind: 'contour' as const, contour } }, ...p.masses.slice(1)] }
    const r = readGft(writeGft(q))
    expect(r).toEqual({ ok: true, project: q })
    if (r.ok && r.project.masses[0].footprint.kind === 'contour') expect(r.project.masses[0].footprint.contour.vertices[1].chamfer).toEqual([2, 3])
  })

  it('a version 14 and a version 13 file open the same way', () => {
    const file = JSON.parse(writeGft(demoProject()))
    const v16 = readGft(JSON.stringify({ ...file, version: 16 }))
    for (const version of [14, 13]) expect(readGft(JSON.stringify({ ...file, version }))).toEqual(v16)
  })

  it('refuses what is not JSON, not an object or has no gfit header', () => {
    expect(readGft('{broken')).toEqual({ ok: false, error: 'the file is not JSON text.' })
    expect(readGft('[1, 2]')).toMatchObject({ ok: false, error: 'the file is not a GFit project.' })
    expect(readGft(JSON.stringify(demoProject()))).toMatchObject({ ok: false, error: expect.stringContaining('"format": "gfit"') })
    expect(readGft(JSON.stringify({ ...demoProject(), format: 'other' }))).toMatchObject({ ok: false })
  })

  it('says where a broken project breaks, and that a newer version is not read', () => {
    const p = { format: 'gfit', ...demoProject() }
    p.masses[1] = { ...p.masses[1], height: 'tall' as unknown as number }
    const r = readGft(JSON.stringify(p))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/^masses\.1\.height: /)
    expect(readGft(JSON.stringify({ ...p, version: 21 }))).toEqual({ ok: false, error: 'it was saved by a newer GFit (project version 21).' })
  })

  it('a version 1 file opens with one level, L1 at the ground, as tall as its tallest mass; the first mass stands on it, the other blocks on copies of it', () => {
    const { buildings: _, options: _o, ...v2 } = demoProject()
    const v1 = {
      format: 'gfit',
      ...v2,
      version: 1,
      masses: v2.masses.map(({ levelId: _l, ...m }) => ({ ...m, height: m.height ?? 12 })),
      dimensions: [{ id: 'd1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, offset: 1 }],
    }
    const r = readGft(JSON.stringify(v1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.version).toBe(20)
    expect(r.project.buildings[0].levels).toEqual([{ id: 'l1', name: 'L1', elevation: 0, height: 12, repeat: 1 }])
    // every mass a block (Phase D.2): a building each, the first on L1, the others on copies of it
    expect(r.project.masses.map((m) => [m.levelId, m.height])).toEqual([
      ['l1', 12],
      ['l2', 12],
      ['l3', 8],
    ])
    expect(r.project.buildings.flatMap((b) => b.levels)).toEqual([
      { id: 'l1', name: 'L1', elevation: 0, height: 12, repeat: 1 },
      { id: 'l2', name: 'L1', elevation: 0, height: 12, repeat: 1 },
      { id: 'l3', name: 'L1', elevation: 0, height: 12, repeat: 1 },
    ])
    expect(r.project.dimensions?.[0].levelId).toBe('l1')
  })

  it('a version 3 file: a program’s size becomes its typical area, so its new masses keep their area at 2:1', () => {
    const p = demoProject()
    const v3 = {
      format: 'gfit',
      ...p,
      version: 3,
      programs: p.programs.map(({ massArea: _a, ...g }) => (g.id === 'warehouse' ? { ...g, size: { width: 160, depth: 80 } } : g)),
    }
    const r = readGft(JSON.stringify(v3))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const warehouse = r.project.programs.find((g) => g.id === 'warehouse')!
    expect(warehouse.size).toBeUndefined()
    expect(warehouse.massArea).toBe(12800)
    expect(r.project.programs.find((g) => g.id === 'office')!.massArea).toBeUndefined()
  })

  it('a version 4 file: a program’s dock walls become docks on or off; none, no docks (Decision "Docks on or off")', () => {
    const p = demoProject()
    const v4 = {
      format: 'gfit',
      ...p,
      version: 4,
      programs: p.programs.map((g) =>
        g.id === 'warehouse' ? { ...g, docks: { faces: 'long', per: 'm', every: 15 } } : g.id === 'office' ? { ...g, docks: { faces: 'none', per: 'm', every: 12 } } : g,
      ),
    }
    const r = readGft(JSON.stringify(v4))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.programs.find((g) => g.id === 'warehouse')!.docks).toEqual({ per: 'm', every: 15 })
    expect(r.project.programs.find((g) => g.id === 'office')!.docks).toBeUndefined()
  })

  it('a version 5 file gets an id of its own, the same each time it is opened; a new project, another', () => {
    const { id: _, ...p } = demoProject()
    const v5 = JSON.stringify({ format: 'gfit', ...p, version: 5 })
    const a = readGft(v5)
    const b = readGft(v5)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.project.id).toMatch(/^p-[0-9a-z]+$/)
    expect(b.project.id).toBe(a.project.id)
    const other = readGft(JSON.stringify({ format: 'gfit', ...p, name: 'Another', version: 5 }))
    expect(other.ok && other.project.id).not.toBe(a.project.id)
    expect(demoProject().id).not.toBe(demoProject().id)
  })

  it('a mass on a level that does not exist is refused', () => {
    const p = { format: 'gfit', ...demoProject() }
    p.masses[0] = { ...p.masses[0], levelId: 'nowhere' }
    expect(readGft(JSON.stringify(p))).toEqual({ ok: false, error: 'masses.0.levelId: no level "nowhere"' })
  })
})

describe('file names', () => {
  it('no accents, spaces or symbols; other alphabets stay; at most 60 characters', () => {
    expect(fileSegment('Planta Querétaro / Nave 3')).toBe('Planta-Queretaro-Nave-3')
    expect(fileSegment('  广场  Łódź ')).toBe('广场-Łodz') // Ł has no accent to drop: it is its own letter
    expect(fileSegment('x'.repeat(80))).toHaveLength(60)
  })

  it('<project>_<date>.gft, and a name with nothing usable still gives a file', () => {
    const d = new Date(2026, 9, 14)
    expect(fileName('Planta Querétaro', 'gft', d)).toBe('Planta-Queretaro_2026-10-14.gft')
    expect(fileName('***', 'gft', d)).toBe('project_2026-10-14.gft')
  })
})
