import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoreMenu } from '../MoreMenu.tsx'

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

/** The button at `btn`; the menu is 200 x 120. */
function mockRects(btn: DOMRect) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('role') === 'menu') return rect(0, 0, 200, 120)
    if (this.getAttribute('aria-haspopup') === 'menu') return btn
    return rect(0, 0, 0, 0)
  })
}

const items = (onSelect = vi.fn()) => [{ key: 'a', label: 'Alpha', onSelect }, { key: 'b', label: 'Beta', onSelect: vi.fn() }]

function open(align: 'left' | 'right' = 'left', onSelect = vi.fn()) {
  render(<div><MoreMenu items={items(onSelect)} align={align} /><button>outside</button></div>)
  fireEvent.click(screen.getByLabelText('More actions'))
  return screen.getByRole('menu')
}

describe('MoreMenu placement', () => {
  beforeEach(() => {
    window.innerWidth = 800
    window.innerHeight = 600
  })
  afterEach(() => vi.restoreAllMocks())

  it('is a fixed child of the body', () => {
    mockRects(rect(100, 100, 32, 32))
    const menu = open()
    expect(menu.parentElement).toBe(document.body)
    expect(menu.style.position).toBe('fixed')
  })
  it('stays inside at the left edge with align right', () => {
    mockRects(rect(0, 100, 32, 32))
    const menu = open('right')
    expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(4)
  })
  it('stays inside at the right edge', () => {
    mockRects(rect(768, 100, 32, 32))
    const menu = open('left')
    expect(parseFloat(menu.style.left) + 200).toBeLessThanOrEqual(796)
  })
  it('opens above the button at the bottom', () => {
    mockRects(rect(100, 560, 32, 32))
    const menu = open()
    expect(parseFloat(menu.style.top) + 120).toBeLessThanOrEqual(560)
  })
  it('a pick runs onSelect and closes', () => {
    mockRects(rect(100, 100, 32, 32))
    const onSelect = vi.fn()
    open('left', onSelect)
    fireEvent.click(screen.getByRole('menuitem', { name: /Alpha/ }))
    expect(onSelect).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('Escape closes and gives the focus back to the button', () => {
    mockRects(rect(100, 100, 32, 32))
    open()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText('More actions'))
  })
  it('a press on the menu keeps it; a press outside, a scroll and a resize close it', () => {
    mockRects(rect(100, 100, 32, 32))
    open()
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: /Beta/ }))
    expect(screen.queryByRole('menu')).not.toBeNull()
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
    for (const ev of ['scroll', 'resize']) {
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.queryByRole('menu')).not.toBeNull()
      act(() => {
        window.dispatchEvent(new Event(ev))
      })
      expect(screen.queryByRole('menu')).toBeNull()
    }
  })
  it('a menu taller than the window scrolls inside it (its height is capped to the window)', () => {
    mockRects(rect(100, 100, 32, 32))
    const menu = open()
    expect(menu.className).toContain('max-h-[calc(100dvh-0.5rem)]')
    expect(menu.className).toContain('overflow-y-auto')
  })
  it('scrolling inside the menu keeps it open; a scroll elsewhere still closes it', () => {
    mockRects(rect(100, 100, 32, 32))
    open()
    act(() => {
      screen.getByRole('menu').dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByRole('menu')).not.toBeNull()
    act(() => {
      screen.getByText('outside').dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
