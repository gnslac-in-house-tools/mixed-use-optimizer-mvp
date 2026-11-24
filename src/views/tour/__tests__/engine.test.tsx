// The tour's engine runs more than one tutorial (spec 2026-11-10-from-zero-tutorial): the sample tour as it was, and
// From zero, where a step waits for the person (Next only once it is done) and *Do it for me* does it, with a *Why*.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STEPS } from '../steps.ts'
import { TourCard } from '../TourCard.tsx'
import { chapters, setStepsFor, stepsOf, useTour, type TourStep } from '../tour.ts'

let flag = false
let ran: string[] = []
const fake: TourStep[] = [
  {
    id: 'a',
    chapter: 'One',
    title: 'Do the thing',
    body: ['Press it.'],
    why: 'Because it matters.',
    act: async () => {
      await Promise.resolve()
      ran.push('a')
      flag = true
    },
    done: () => flag,
  },
  { id: 'b', chapter: 'Two', title: 'The end', body: ['Done.'] },
]

beforeEach(() => {
  flag = false
  ran = []
  setStepsFor('zero', fake)
  useTour.setState({ offer: false, active: false, index: 0, tutorial: 'tour' })
})
afterEach(() => setStepsFor('zero', []))

describe('the engine, more than one tutorial', () => {
  it('starts a tutorial by its id and lists its chapters', () => {
    act(() => useTour.getState().start(undefined, 'zero'))
    expect(useTour.getState()).toMatchObject({ active: true, index: 0, tutorial: 'zero' })
    expect(stepsOf('zero')).toBe(fake)
    expect(chapters('zero')).toEqual(['One', 'Two'])
    expect(chapters()).toEqual(chapters('tour'))
  })

  it('in From zero, Next waits for the step to be done', () => {
    act(() => useTour.getState().start(undefined, 'zero'))
    act(() => useTour.getState().next())
    expect(useTour.getState().index).toBe(0)
    expect(ran).toEqual([])
    flag = true
    act(() => useTour.getState().next())
    expect(useTour.getState().index).toBe(1)
  })

  it('Do it for me awaits the act, then goes on; on the last step it ends', async () => {
    act(() => useTour.getState().start(undefined, 'zero'))
    await act(() => useTour.getState().doIt())
    expect(ran).toEqual(['a'])
    expect(useTour.getState().index).toBe(1)
    await act(() => useTour.getState().doIt())
    expect(useTour.getState().active).toBe(false)
  })

  it('the sample tour’s Next still does what a step asks', () => {
    const at = STEPS.findIndex((s) => s.act && s.done)
    act(() => useTour.getState().goTo(at))
    useTour.setState({ active: true })
    act(() => useTour.getState().next())
    expect(STEPS[at].done!()).toBe(true)
    expect(useTour.getState().index).toBe(at + 1)
  })
})

describe('the card in From zero', () => {
  it('sees a step done on its own, without a frame or a store change (a window in the background)', async () => {
    const raf = window.requestAnimationFrame
    // a window in the background draws no frames
    window.requestAnimationFrame = () => 0
    try {
      render(<TourCard />)
      act(() => useTour.getState().start(undefined, 'zero'))
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
      flag = true
      await waitFor(() => expect(screen.getByRole('button', { name: 'Next ✓' })).not.toBeDisabled(), { timeout: 1500 })
    } finally {
      window.requestAnimationFrame = raf
    }
  })

  it('offers Do it for me and a Why; Next waits, then shows ✓', () => {
    render(<TourCard />)
    act(() => useTour.getState().start(undefined, 'zero'))
    const card = screen.getByRole('dialog', { name: 'Tour: Do the thing' })
    expect(screen.getByRole('button', { name: 'Do it for me' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.click(screen.getByText('Why'))
    expect(card).toHaveTextContent('Because it matters.')
    // the card reads `done` again whenever it draws (its own tick in the app): one more draw shows it
    flag = true
    act(() => useTour.getState().goTo(1))
    act(() => useTour.getState().goTo(0))
    expect(screen.getByRole('button', { name: 'Next ✓' })).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Do it for me' })).toBeNull()
  })
})
