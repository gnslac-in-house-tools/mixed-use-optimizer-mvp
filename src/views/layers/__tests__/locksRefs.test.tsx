// The views' lock helpers over `Ref`s (Phase AS.4 task 4): `isRefLocked`, `lockedAmong`, `pickUnlocked`, `keptByLock`, `tellKept` and `lockedFirst` (views/layers/locks.ts)
// answer for a street, a lot and a gate as for a mass, in the same words, so the plan's picks, the verbs and the menu have one set; a list of mass ids still works
// (every caller of the masses' own helpers keeps its signature).
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Ref } from '../../../kinds/types.ts'
import { LOCKED } from '../../../model/picked.ts'
import { actions } from '../../../state/actions/index.ts'
import { useToast } from '../../layout/toast.ts'
import { type Fixture, fixture, lockGates, lockLots, lockStreets, s, start, toast } from '../../editing/__tests__/kindsFixture.ts'
import { isMassLocked, isRefLocked, keptByLock, lockedAmong, lockedFirst, pickUnlocked, tellKept } from '../locks.ts'

let f: Fixture
const street = (seg: string): Ref => ({ kind: 'street', id: `street:${seg}` })
const lotRef = (i: number): Ref => ({ kind: 'lot', id: f.lots[i] })
const gateRef = (i: number): Ref => ({ kind: 'gate', id: f.gates[i] })

beforeEach(() => {
  f = fixture()
  start(f.project)
  useToast.setState({ toast: null, confirmation: null })
})

describe('isRefLocked', () => {
  it('a street is locked when all its segments are, a lot and a gate by their flag; a mass as it was', () => {
    expect(isRefLocked(street('s1'))).toBe(false)
    act(() => lockStreets(['s2']))
    expect(isRefLocked(street('s1'))).toBe(false)
    act(() => lockStreets(['s1', 's3']))
    expect(isRefLocked(street('s1'))).toBe(true)
    act(() => lockLots([f.lots[0]]))
    expect([isRefLocked(lotRef(0)), isRefLocked(lotRef(1))]).toEqual([true, false])
    act(() => lockGates([f.gates[0]]))
    expect([isRefLocked(gateRef(0)), isRefLocked(gateRef(1))]).toEqual([true, false])
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], true)))
    expect(isRefLocked({ kind: 'mass', id: 'm1' })).toBe(true)
    expect(isMassLocked('m1')).toBe(true)
    // a kind with no padlock of this kind, or something that is not there
    expect(isRefLocked({ kind: 'existing-road', id: f.existing[0] })).toBe(false)
    expect(isRefLocked({ kind: 'lot', id: 'nope' })).toBe(false)
  })
})

describe('lockedAmong and pickUnlocked over refs', () => {
  beforeEach(() => {
    act(() => lockStreets(['s1', 's2', 's3']))
    act(() => lockLots([f.lots[0]]))
  })

  it('lockedAmong gives the locked refs, in the order asked; a list of mass ids gives the masses as before', () => {
    const refs = [street('s1'), street('s4'), lotRef(0), lotRef(1), gateRef(0)]
    expect(lockedAmong(refs)).toEqual([street('s1'), lotRef(0)])
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], true)))
    expect(lockedAmong(['m1', 'm2']).map((m) => m.id)).toEqual(['m1'])
  })

  it('pickUnlocked keeps the free ones; all locked: none, and the notice says where the lock comes off', () => {
    expect(pickUnlocked([street('s4'), lotRef(0), lotRef(1)])).toEqual([street('s4'), lotRef(1)])
    expect(toast()).toBeUndefined()
    expect(pickUnlocked([street('s1'), lotRef(0)])).toEqual([])
    expect(toast()).toBe(LOCKED)
    useToast.setState({ toast: null })
    expect(pickUnlocked([])).toEqual([])
    expect(toast()).toBeUndefined()
  })

  it('pickUnlocked of mass ids is as it was', () => {
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], true)))
    expect(pickUnlocked(['m1', 'm2'])).toEqual(['m2'])
    expect(pickUnlocked(['m1'])).toEqual([])
  })
})

describe('keptByLock and lockedFirst, in the kind’s words', () => {
  it('one, in the object’s name; several, by their kind', () => {
    act(() => lockLots([f.lots[0], f.lots[1]]))
    const name = s().project.options[0].lots!.find((l) => l.id === f.lots[0])!.name
    expect(keptByLock([lotRef(0)], 'size')).toBe(`${name} is locked: unlock it to change its size.`)
    expect(keptByLock([lotRef(0), lotRef(1)], 'size')).toBe('2 locked lots: unlock them to change their size.')
    expect(keptByLock([lotRef(0), lotRef(1)], 'size', 3)).toBe('2 locked lots kept their size: unlock them to change them.')
    expect(keptByLock([lotRef(0), gateRef(0)], 'place')).toBe('2 locked things: unlock them to change their place.')
  })

  it('masses are as they were', () => {
    act(() => s().apply((p) => actions.lockMasses(p, ['m1', 'm2'], true)))
    const locked = lockedAmong(['m1', 'm2'])
    expect(keptByLock(locked, 'program')).toBe('2 locked blocks: unlock them to change their program.')
    expect(keptByLock([locked[0]], 'program')).toBe(`${locked[0].name} is locked: unlock it to change its program.`)
    tellKept(locked, 'program', 1)
    expect(toast()).toBe('2 locked blocks kept their program: unlock them to change them.')
  })

  it('lockedFirst says the kind', () => {
    expect(lockedFirst(1)).toBe('A locked block: unlock first')
    expect(lockedFirst(2)).toBe('2 locked blocks: unlock first')
    expect(lockedFirst(1, 'street')).toBe('A locked street: unlock first')
    expect(lockedFirst(2, 'lot')).toBe('2 locked lots: unlock first')
    expect(lockedFirst(3, 'things')).toBe('3 locked things: unlock first')
  })
})
