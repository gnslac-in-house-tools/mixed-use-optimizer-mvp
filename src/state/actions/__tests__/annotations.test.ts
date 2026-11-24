// Reference lines and notes as project data (Phase AS.5 task 1): the verbs of `state/actions/annotations.ts`, what the tools of what is
// picked do with them (`Picked.lines`, `Picked.notes`), the cascades of a level and a building, and the padlock `settle` holds on both.
import { describe, expect, it } from 'vitest'
import { noteName, referenceLineName } from '../../../engine/annotations.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { isLocked } from '../../../kinds/locked.ts'
import { NOTHING_PICKED, type Picked } from '../../../model/picked.ts'
import { ProjectSchema, type Project } from '../../../model/schema.ts'
import { demoProject } from '../../demo.ts'
import { settle } from '../../settle.ts'
import { createAppStore } from '../../store.ts'
import { actions } from '../index.ts'
import { addBuilding, copyBuilding, removeBuilding, removeOption } from '../buildings.ts'
import { addDimension } from '../dimensions.ts'
import { removeLevel, removeLevels, withLevels } from '../levels.ts'
import { addMass, removeMasses } from '../masses.ts'
import { copyPicked, movePicked, turnPicked } from '../selection.ts'
import {
  addNote,
  addReferenceLine,
  lockNotes,
  lockReferenceLines,
  moveNotes,
  moveReferenceLines,
  removeNote,
  removeReferenceLine,
  setNoteSize,
  setNoteText,
  setReferenceLinePoint,
  turnNotes,
  turnReferenceLines,
} from '../annotations.ts'

const o1 = 'o1'
const pick = (p: Partial<Picked>): Picked => ({ ...NOTHING_PICKED, ...p })
const A = { x: 0, y: 0 }
const B = { x: 10, y: 0 }
const C = { x: 10, y: 10 }

/** What `settle` says of an edit: the reason when it is refused, null when it is kept. */
const refusal = (before: Project, after: Project): string | null => {
  const r = settle(before, after)
  return 'refused' in r ? r.refused : null
}

/** The demo with two reference lines (r1, r2) and two notes (t1 on l1, t2 on l1). */
function annotated() {
  let p = demoProject({ streets: false })
  p = addReferenceLine(p, [A, B])!.project
  p = addReferenceLine(p, [B, C, { x: 20, y: 10 }])!.project
  p = addNote(p, { x: 5, y: 5 }, 'Loading area north of the second building')!.project
  p = addNote(p, { x: 30, y: 30 })!.project
  return p
}

describe('names', () => {
  it('a reference line is Reference line N; a note’s name is its first words', () => {
    expect(referenceLineName(0)).toBe('Reference line 1')
    expect(referenceLineName(2)).toBe('Reference line 3')
    expect(noteName('Note')).toBe('Note')
    expect(noteName('  Loading   area north of the second building ')).toBe('Loading area north of…')
    expect(noteName('Gate\nsecond line')).toBe('Gate')
    expect(noteName('')).toBe('Note')
    expect(noteName('x'.repeat(80)).length).toBeLessThanOrEqual(25)
  })
})

describe('reference lines', () => {
  it('add gives ids r1, r2…, a line of two points at least; remove takes it out', () => {
    const p = demoProject()
    const a = addReferenceLine(p, [A, B])!
    const b = addReferenceLine(a.project, [B, C, { x: 20, y: 10 }])!
    expect([a.id, b.id]).toEqual(['r1', 'r2'])
    expect(b.project.referenceLines).toHaveLength(2)
    expect(addReferenceLine(p, [A])).toBeNull()
    expect(addReferenceLine(p, [])).toBeNull()
    expect(addReferenceLine(p, [A, { x: NaN, y: 0 }])).toBeNull()
    expect(removeReferenceLine(b.project, 'r1').referenceLines!.map((x) => x.id)).toEqual(['r2'])
    expect(removeReferenceLine(b.project, 'nope')).toBe(b.project)
    // a new id is the first free one
    expect(addReferenceLine(removeReferenceLine(b.project, 'r1'), [A, B])!.id).toBe('r1')
    expect(ProjectSchema.safeParse(b.project).success).toBe(true)
  })

  it('a line is the project’s: it follows no level, and the points are copied', () => {
    const pts = [{ ...A }, { ...B }]
    const r = addReferenceLine(demoProject(), pts)!
    pts[0].x = 99
    expect(r.project.referenceLines![0]).toEqual({ id: 'r1', points: [A, B] })
  })

  it('move and turn act on the ones named; nothing to change is the same project', () => {
    const p = annotated()
    const m = moveReferenceLines(p, ['r2'], { x: 5, y: -5 })
    expect(m.referenceLines![0]).toBe(p.referenceLines![0])
    expect(m.referenceLines![1].points).toEqual([{ x: 15, y: -5 }, { x: 15, y: 5 }, { x: 25, y: 5 }])
    expect(moveReferenceLines(p, ['r1'], { x: 0, y: 0 })).toBe(p)
    expect(moveReferenceLines(p, ['nope'], { x: 1, y: 1 })).toBe(p)
    expect(moveReferenceLines(p, ['r1'], { x: NaN, y: 1 })).toBe(p)
    const t = turnReferenceLines(p, ['r1'], A, 90)
    expect(t.referenceLines![0].points[1].x).toBeCloseTo(0)
    expect(t.referenceLines![0].points[1].y).toBeCloseTo(10)
    expect(t.referenceLines![1]).toBe(p.referenceLines![1])
    expect(turnReferenceLines(p, ['r1'], A, 0)).toBe(p)
  })

  it('setReferenceLinePoint moves one point of a line; a point that is not there, or the same, changes nothing', () => {
    const p = annotated()
    const q = setReferenceLinePoint(p, 'r2', 1, { x: 12, y: 12 })
    expect(q.referenceLines![1].points).toEqual([B, { x: 12, y: 12 }, { x: 20, y: 10 }])
    expect(setReferenceLinePoint(p, 'r2', 3, A)).toBe(p)
    expect(setReferenceLinePoint(p, 'r2', -1, A)).toBe(p)
    expect(setReferenceLinePoint(p, 'r2', 1, C)).toBe(p)
    expect(setReferenceLinePoint(p, 'r2', 1, { x: NaN, y: 0 })).toBe(p)
    expect(setReferenceLinePoint(p, 'nope', 0, A)).toBe(p)
  })

  it('lockReferenceLines sets or takes away the padlock; nothing to change is the same project', () => {
    const p = annotated()
    const on = lockReferenceLines(p, ['r1'], true)
    expect(on.referenceLines![0].locked).toBe(true)
    expect(on.referenceLines![1]).toBe(p.referenceLines![1])
    expect(lockReferenceLines(on, ['r1'], true)).toBe(on)
    const off = lockReferenceLines(on, ['r1'], false)
    expect('locked' in off.referenceLines![0]).toBe(false)
    expect(lockReferenceLines(p, ['r1'], false)).toBe(p)
    expect(lockReferenceLines(p, ['r1', 'r2'], true).referenceLines!.every((x) => x.locked)).toBe(true)
  })
})

describe('notes', () => {
  it('add gives ids t1, t2…, on the level asked (else the ground floor), reading Note unless it is given text', () => {
    const p = demoProject()
    const a = addNote(p, A)!
    const b = addNote(a.project, B, 'Fire lane', 'l1')!
    const c = addNote(b.project, C, 'Elsewhere', 'no-such-level')!
    expect([a.id, b.id, c.id]).toEqual(['t1', 't2', 't3'])
    expect(a.project.notes).toEqual([{ id: 't1', levelId: 'l1', at: A, text: 'Note' }])
    expect(c.project.notes![2].levelId).toBe('l1')
    expect(addNote(p, { x: NaN, y: 0 })).toBeNull()
    expect(addNote(p, A, '')).toBeNull()
    expect(removeNote(c.project, 't2').notes!.map((n) => n.id)).toEqual(['t1', 't3'])
    expect(removeNote(c.project, 'nope')).toBe(c.project)
    expect(ProjectSchema.safeParse(c.project).success).toBe(true)
  })

  it('move shifts the point; turn takes the point round and the angle with it (kept in 0…360, none when 0)', () => {
    const p = annotated()
    const m = moveNotes(p, ['t2'], { x: 1, y: 2 })
    expect(m.notes![1].at).toEqual({ x: 31, y: 32 })
    expect(m.notes![0]).toBe(p.notes![0])
    expect(moveNotes(p, ['t2'], { x: 0, y: 0 })).toBe(p)
    const t = turnNotes(p, ['t1'], A, 90)
    expect(t.notes![0].at.x).toBeCloseTo(-5)
    expect(t.notes![0].at.y).toBeCloseTo(5)
    expect(t.notes![0].angle).toBe(90)
    const again = turnNotes(t, ['t1'], A, -90)
    expect(again.notes![0].angle).toBeUndefined()
    expect(turnNotes(t, ['t1'], A, -30).notes![0].angle).toBe(60)
    expect(turnNotes(t, ['t1'], A, 300).notes![0].angle).toBe(30)
    expect(turnNotes(p, ['t1'], A, 0)).toBe(p)
  })

  it('setNoteText and setNoteSize; absent is the middle size; a blank text or the same one changes nothing', () => {
    const p = annotated()
    expect(setNoteText(p, 't2', 'Substation').notes![1].text).toBe('Substation')
    expect(setNoteText(p, 't2', 'Note')).toBe(p)
    expect(setNoteText(p, 't2', '   ')).toBe(p)
    expect(setNoteText(p, 'nope', 'x')).toBe(p)
    const big = setNoteSize(p, 't2', 'large')
    expect(big.notes![1].size).toBe('large')
    expect(setNoteSize(big, 't2', 'large')).toBe(big)
    expect('size' in setNoteSize(big, 't2').notes![1]).toBe(false)
    expect(setNoteSize(p, 't2', 'small').notes![1].size).toBe('small')
    expect(setNoteSize(p, 't2')).toBe(p)
  })

  it('lockNotes sets or takes away the padlock', () => {
    const p = annotated()
    const on = lockNotes(p, ['t1'], true)
    expect(on.notes![0].locked).toBe(true)
    expect(lockNotes(on, ['t1'], true)).toBe(on)
    expect('locked' in lockNotes(on, ['t1'], false).notes![0]).toBe(false)
    expect(lockNotes(p, ['t1'], false)).toBe(p)
  })
})

describe('each verb is one undo step, through settle', () => {
  const verbs: [string, (p: Project) => Project][] = [
    ['addReferenceLine', (p) => actions.addReferenceLine(p, [A, B])!.project],
    ['removeReferenceLine', (p) => actions.removeReferenceLine(p, 'r1')],
    ['moveReferenceLines', (p) => actions.moveReferenceLines(p, ['r1'], { x: 1, y: 1 })],
    ['turnReferenceLines', (p) => actions.turnReferenceLines(p, ['r1'], A, 45)],
    ['setReferenceLinePoint', (p) => actions.setReferenceLinePoint(p, 'r1', 0, { x: -3, y: 4 })],
    ['lockReferenceLines', (p) => actions.lockReferenceLines(p, ['r1'], true)],
    ['addNote', (p) => actions.addNote(p, A)!.project],
    ['removeNote', (p) => actions.removeNote(p, 't1')],
    ['moveNotes', (p) => actions.moveNotes(p, ['t1'], { x: 1, y: 1 })],
    ['turnNotes', (p) => actions.turnNotes(p, ['t1'], A, 45)],
    ['setNoteText', (p) => actions.setNoteText(p, 't1', 'Changed')],
    ['setNoteSize', (p) => actions.setNoteSize(p, 't1', 'large')],
    ['lockNotes', (p) => actions.lockNotes(p, ['t1'], true)],
  ]
  for (const [name, verb] of verbs) {
    it(name, () => {
      const p = annotated()
      const store = createAppStore(p)
      store.getState().apply(verb)
      expect(store.getState().history.past).toHaveLength(1)
      expect(store.getState().project).not.toBe(p)
      expect(ProjectSchema.safeParse(store.getState().project).success).toBe(true)
      store.getState().undo()
      expect(store.getState().project.referenceLines).toEqual(p.referenceLines)
      expect(store.getState().project.notes).toEqual(p.notes)
      store.getState().redo()
      expect(store.getState().project).not.toBe(p)
    })
  }
})

describe('what is picked: lines and notes', () => {
  it('movePicked moves them with the rest, and they are all there is to move', () => {
    const p = annotated()
    const r = movePicked(p, o1, pick({ lines: ['r1'], notes: ['t2'] }), { x: 2, y: 3 })
    expect(r.skipped).toEqual([])
    expect(r.project.referenceLines![0].points).toEqual([{ x: 2, y: 3 }, { x: 12, y: 3 }])
    expect(r.project.referenceLines![1]).toBe(p.referenceLines![1])
    expect(r.project.notes![1].at).toEqual({ x: 32, y: 33 })
    expect(r.project.notes![0]).toBe(p.notes![0])
    // a mix: a mass and a note go together
    const mix = movePicked(p, o1, pick({ masses: ['m1'], notes: ['t1'] }), { x: 4, y: 0 })
    expect(mix.project.notes![0].at).toEqual({ x: 9, y: 5 })
    expect(mix.project.masses.find((m) => m.id === 'm1')).not.toEqual(p.masses.find((m) => m.id === 'm1'))
  })

  it('turnPicked turns them about the pivot; a note’s angle follows', () => {
    const p = annotated()
    const r = turnPicked(p, o1, pick({ lines: ['r1'], notes: ['t1'] }), A, 90)
    expect(r.skipped).toEqual([])
    expect(r.project.referenceLines![0].points[1].y).toBeCloseTo(10)
    expect(r.project.notes![0].angle).toBe(90)
    expect(r.project.notes![0].at.y).toBeCloseTo(5)
  })

  it('copyPicked copies them with new ids, unlocked, a note on its own level, and leaves the originals', () => {
    let p = annotated()
    p = lockReferenceLines(p, ['r1'], true)
    p = lockNotes(p, ['t1'], true)
    p = setNoteSize(setNoteText(p, 't1', 'Gate A'), 't1', 'large')
    const r = copyPicked(p, o1, pick({ lines: ['r1'], notes: ['t1'] }), { x: 7, y: 0 })
    expect(r.skipped).toEqual([])
    expect(r.project.referenceLines).toHaveLength(3)
    expect(r.project.referenceLines![0]).toBe(p.referenceLines![0])
    expect(r.project.referenceLines![2]).toEqual({ id: 'r3', points: [{ x: 7, y: 0 }, { x: 17, y: 0 }] })
    expect(r.project.notes).toHaveLength(3)
    expect(r.project.notes![2]).toEqual({ id: 't3', levelId: p.notes![0].levelId, at: { x: 12, y: 5 }, text: 'Gate A', size: 'large' })
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
  })

  it('a copy keeps a turned note’s angle; lines and notes alone are something (not nothing picked)', () => {
    const p = turnNotes(annotated(), ['t1'], { x: 5, y: 5 }, 30)
    const r = copyPicked(p, o1, pick({ notes: ['t1'] }), { x: 1, y: 1 })
    expect(r.project.notes![2].angle).toBe(30)
    expect(movePicked(p, o1, pick({ lines: ['r1'] }), { x: 1, y: 1 }).project).not.toBe(p)
    expect(movePicked(p, o1, NOTHING_PICKED, { x: 1, y: 1 }).project).toBe(p)
  })

  it('a copy of a lot or a gate is not in the group of the original', () => {
    // (a group of any kind is task 6; its field is there already, and a copy must not join it)
    const p = demoProject({ streets: false })
    const gate = (p.site.gates ?? [])[0]
    const withGroup: Project = { ...p, site: { ...p.site, gates: (p.site.gates ?? []).map((g) => (g.id === gate.id ? { ...g, group: 'g1' } : g)) } }
    const r = copyPicked(withGroup, o1, pick({ gates: [gate.id] }), { x: 1, y: 1 })
    const copies = gatesOf(r.project, o1).filter((g) => g.id !== gate.id)
    expect(copies.length).toBeGreaterThan(0)
    expect(copies.every((g) => g.group === undefined)).toBe(true)
  })
})

describe('cascades', () => {
  /** A building with two levels (l1 and a second), a note on each. */
  function stacked() {
    let p = demoProject({ streets: false })
    const b = p.buildings[0]
    p = withLevels(p, b.id, [...b.levels, { id: 'l9', name: 'L9', elevation: 40, height: 4, repeat: 1 }])
    p = addNote(p, A, 'on l1', 'l1')!.project
    p = addNote(p, B, 'on l9', 'l9')!.project
    p = addReferenceLine(p, [A, B])!.project
    return p
  }

  it('a level removed takes its notes, and not the project’s reference lines', () => {
    const p = stacked()
    const q = removeLevel(p, 'l9')
    expect(q.notes!.map((n) => n.id)).toEqual(['t1'])
    expect(q.referenceLines).toBe(p.referenceLines)
    const many = removeLevels(p, ['l9'])
    expect(many.notes!.map((n) => n.id)).toEqual(['t1'])
    expect(ProjectSchema.safeParse(q).success).toBe(true)
  })

  it('a building removed takes the notes of its levels', () => {
    let p = stacked()
    const a = addBuilding(p)
    p = addNote(a.project, C, 'on the new one', a.project.buildings.at(-1)!.levels[0].id)!.project
    expect(p.notes).toHaveLength(3)
    const q = removeBuilding(p, a.id)
    expect(q.notes!.map((n) => n.text)).toEqual(['on l1', 'on l9'])
  })

  it('a building copied copies its levels’ notes with new ids on the copy’s levels', () => {
    const p = stacked()
    const r = copyBuilding(p, p.buildings[0].id, o1)!
    const copy = r.project.buildings.find((b) => b.id === r.id)!
    expect(r.project.notes).toHaveLength(4)
    const mine = r.project.notes!.slice(2)
    expect(mine.map((n) => n.text)).toEqual(['on l1', 'on l9'])
    expect(mine.map((n) => n.id)).toEqual(['t3', 't4'])
    expect(mine.map((n) => n.levelId)).toEqual(copy.levels.map((l) => l.id))
    expect(r.project.referenceLines).toHaveLength(1)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
  })

  it('removing an option takes the buildings only it shows, with their notes, locked or not', () => {
    let p = demoProject({ streets: false })
    const o = actions.addOption(p, {})
    const b = addBuilding(o.project)
    p = actions.addBuildingToOption(b.project, o.id, b.id)
    p = addNote(p, A, 'only here', p.buildings.at(-1)!.levels[0].id)!.project
    p = lockNotes(p, ['t1'], true)
    const q = removeOption(p, o.id)
    expect(q.notes ?? []).toEqual([])
    expect(refusal(p, q)).toBeNull()
  })

  it('a level that goes when its masses leave takes its notes, and notes follow levels that merge', () => {
    const p = stacked()
    // l9 has no masses: the settled project drops it, and its note with it
    const r = settle(p, { ...p, notes: [...p.notes!] })
    expect('project' in r && r.project.notes!.map((n) => n.id)).toEqual(['t1'])
  })
})

describe('the padlock on a reference line and a note', () => {
  it('isLocked says it for a reference-line and a note ref', () => {
    const p = lockNotes(lockReferenceLines(annotated(), ['r2'], true), ['t1'], true)
    expect(isLocked(p, { kind: 'reference-line', id: 'r2' })).toBe(true)
    expect(isLocked(p, { kind: 'reference-line', id: 'r1' })).toBe(false)
    expect(isLocked(p, { kind: 'note', id: 't1' })).toBe(true)
    expect(isLocked(p, { kind: 'note', id: 't2' })).toBe(false)
    expect(isLocked(p, { kind: 'note', id: 'nope' })).toBe(false)
  })

  it('a locked line is not changed or deleted; the words are the other kinds’', () => {
    const p = lockReferenceLines(annotated(), ['r2'], true)
    expect(refusal(p, moveReferenceLines(p, ['r2'], { x: 1, y: 1 }))).toBe('Reference line 2 is locked: unlock it to change it.')
    expect(refusal(p, turnReferenceLines(p, ['r2'], A, 10))).toBe('Reference line 2 is locked: unlock it to change it.')
    expect(refusal(p, setReferenceLinePoint(p, 'r2', 0, { x: 3, y: 3 }))).toBe('Reference line 2 is locked: unlock it to change it.')
    expect(refusal(p, removeReferenceLine(p, 'r2'))).toBe('Reference line 2 is locked: unlock it to delete it.')
    // its neighbour is free, and the padlock itself may change
    expect(refusal(p, moveReferenceLines(p, ['r1'], { x: 1, y: 1 }))).toBeNull()
    expect(refusal(p, lockReferenceLines(p, ['r2'], false))).toBeNull()
    // the same edit that frees it and moves it is held by what was before
    const both = { ...p, referenceLines: p.referenceLines!.map((x) => (x.id === 'r2' ? { id: x.id, points: [A, B] } : x)) }
    expect(refusal(p, both)).toMatch(/Reference line 2 is locked/)
  })

  it('a locked note is not changed or deleted, named by its first words', () => {
    const p = lockNotes(annotated(), ['t1'], true)
    const change = 'Loading area north of… is locked: unlock it to change it.'
    expect(refusal(p, moveNotes(p, ['t1'], { x: 1, y: 1 }))).toBe(change)
    expect(refusal(p, turnNotes(p, ['t1'], A, 10))).toBe(change)
    expect(refusal(p, setNoteText(p, 't1', 'Other'))).toBe(change)
    expect(refusal(p, setNoteSize(p, 't1', 'small'))).toBe(change)
    expect(refusal(p, removeNote(p, 't1'))).toBe('Loading area north of… is locked: unlock it to delete it.')
    expect(refusal(p, moveNotes(p, ['t2'], { x: 1, y: 1 }))).toBeNull()
    expect(refusal(p, lockNotes(p, ['t1'], false))).toBeNull()
  })

  it('a locked note holds its level: the level is not removed under it', () => {
    let p = demoProject({ streets: false })
    const b = p.buildings[0]
    p = withLevels(p, b.id, [...b.levels, { id: 'l9', name: 'L9', elevation: 40, height: 4, repeat: 1 }])
    p = lockNotes(addNote(p, A, 'Fixed', 'l9')!.project, ['t1'], true)
    expect(refusal(p, removeLevel(p, 'l9'))).toBe('Fixed is locked: unlock it to delete it.')
  })

  it('a locked note holds its level when its last mass leaves: the level would go with the note, so the edit is refused', () => {
    let p = demoProject({ streets: false })
    const b = p.buildings[0]
    p = withLevels(p, b.id, [...b.levels, { id: 'l9', name: 'L9', elevation: 40, height: 4, repeat: 1 }])
    const up = addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 400, y: 300 }, width: 20, depth: 20, rotation: 0 }, levelId: 'l9' })
    p = lockNotes(addNote(up.project, A, 'Fixed', 'l9')!.project, ['t1'], true)
    // the level's last mass removed: tidyLevels would drop the level and its note; the note is locked, as removing the level is refused
    expect(refusal(p, removeMasses(p, [up.id]))).toBe('Fixed is locked: unlock it to delete it.')
    // unlocked, the note goes with its level, as before
    const free = lockNotes(p, ['t1'], false)
    const r = settle(free, removeMasses(free, [up.id]))
    expect('project' in r ? (r.project.notes ?? []) : r.refused).toEqual([])
    // a mass that is not the last one leaves it alone
    const two = addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 440, y: 300 }, width: 20, depth: 20, rotation: 0 }, levelId: 'l9' })
    expect(refusal(two.project, removeMasses(two.project, [two.id]))).toBeNull()
  })

  it('a locked note holds its building when its last mass leaves: the building would go with it, so the edit is refused', () => {
    let p = demoProject({ streets: false })
    const a = addBuilding(p)
    const o = actions.addBuildingToOption(a.project, o1, a.id)
    const level = o.buildings.at(-1)!.levels[0].id
    const added = addMass(o, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 400, y: 300 }, width: 20, depth: 20, rotation: 0 }, levelId: level })
    p = lockNotes(addNote(added.project, A, 'Annex plan', level)!.project, ['t1'], true)
    expect(refusal(p, removeMasses(p, [added.id]))).toBe('Annex plan is locked: unlock it to delete it.')
    const free = lockNotes(p, ['t1'], false)
    const r = settle(free, removeMasses(free, [added.id]))
    expect('project' in r ? r.project.buildings.some((x) => x.id === a.id) : r.refused).toBe(false)
  })

  it('a locked note in a building that goes with its option still goes (the case that was already allowed)', () => {
    let p = demoProject({ streets: false })
    const o = actions.addOption(p, {})
    const b = addBuilding(o.project)
    p = actions.addBuildingToOption(b.project, o.id, b.id)
    const level = p.buildings.at(-1)!.levels[0].id
    p = addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 400, y: 300 }, width: 20, depth: 20, rotation: 0 }, levelId: level }).project
    p = lockNotes(addNote(p, A, 'only here', level)!.project, ['t1'], true)
    const q = removeOption(p, o.id)
    expect(q.notes ?? []).toEqual([])
    expect(refusal(p, q)).toBeNull()
  })

  it('an unrelated edit leaves them alone (a dimension drawn, a mass moved)', () => {
    const p = lockNotes(lockReferenceLines(annotated(), ['r1'], true), ['t1'], true)
    expect(refusal(p, addDimension(p, A, B, 1)!.project)).toBeNull()
    expect(refusal(p, actions.moveMass(p, 'm1', { x: 1, y: 0 }))).toBeNull()
  })
})
