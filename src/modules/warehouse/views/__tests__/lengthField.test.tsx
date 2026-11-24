// LengthField (Phase BE.8): a NumberField whose value, bounds and commit are in metres, shown and typed in the unit.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LengthField } from '../LengthField.tsx'
import { useUnits } from '../units.ts'

beforeEach(() => {
  act(() => useUnits.getState().setUnit('m'))
})

describe('LengthField', () => {
  it('in feet it shows feet and commits metres', () => {
    const onCommit = vi.fn()
    act(() => useUnits.getState().setUnit('ft'))
    render(<LengthField label="Width" min={1} max={100} value={15.24} onCommit={onCommit} />)
    const input = screen.getByRole('textbox', { name: /Width/ }) as HTMLInputElement
    expect(input.value).toBe('50')
    expect(screen.getByText('ft')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '100' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith(30.48)
  })

  it('20 toggles of the unit show the stored value in each and commit nothing', () => {
    const onCommit = vi.fn()
    render(<LengthField label="Width" min={1} max={100} value={15.24} onCommit={onCommit} />)
    const input = () => (screen.getByRole('textbox', { name: /Width/ }) as HTMLInputElement).value
    for (let i = 0; i < 20; i++) {
      act(() => useUnits.getState().setUnit(i % 2 ? 'm' : 'ft'))
      expect(input()).toBe(i % 2 ? '15.24' : '50')
    }
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('in metres it is the NumberField it was', () => {
    const onCommit = vi.fn()
    render(<LengthField label="Width" min={1} max={100} value={15.24} onCommit={onCommit} />)
    const input = screen.getByRole('textbox', { name: /Width/ }) as HTMLInputElement
    expect(input.value).toBe('15.24')
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith(20)
  })

  it('typing the value it shows commits nothing', () => {
    const onCommit = vi.fn()
    act(() => useUnits.getState().setUnit('ft'))
    render(<LengthField label="Width" value={15.24} onCommit={onCommit} />)
    const input = screen.getByRole('textbox', { name: /Width/ }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '50' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('a bound shown rounded can be typed back: it lands on the bound', () => {
    const onCommit = vi.fn()
    act(() => useUnits.getState().setUnit('ft'))
    render(<LengthField label="Wall" min={0.05} max={2} value={1} onCommit={onCommit} />)
    const input = screen.getByRole('textbox', { name: /Wall/ }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '0.16' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith(0.05)
  })
})
