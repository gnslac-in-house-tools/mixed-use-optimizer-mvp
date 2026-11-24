import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { Menu, type MenuEntry } from '../Menu.tsx'

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

/** The top menu is `top` big, a sub-menu 160 x 100; a row (by its key) is where `rows` puts it. */
function mockRects(rows: Record<string, DOMRect> = {}, top = { width: 200, height: 120 }) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('role') === 'menu') return this.dataset.depth === '0' ? rect(0, 0, top.width, top.height) : rect(0, 0, 160, 100)
    const key = this.dataset.menuKey
    return (key && rows[key]) || rect(0, 0, 0, 0)
  })
}

interface Spies {
  alpha: Mock<() => void>
  beta: Mock<() => void>
  gamma: Mock<() => void>
  mono: Mock<() => void>
  duo: Mock<() => void>
  trio: Mock<() => void>
  delta: Mock<() => void>
}

function fixture(): { items: MenuEntry[]; spies: Spies } {
  const spies: Spies = { alpha: vi.fn<() => void>(), beta: vi.fn<() => void>(), gamma: vi.fn<() => void>(), mono: vi.fn<() => void>(), duo: vi.fn<() => void>(), trio: vi.fn<() => void>(), delta: vi.fn<() => void>() }
  const items: MenuEntry[] = [
    { key: 'alpha', label: 'Alpha', detail: 'Ctrl+A', onSelect: spies.alpha },
    { key: 'beta', label: 'Beta', disabled: true, title: 'Pick something first', onSelect: spies.beta },
    { key: 'gamma', label: 'Gamma', checked: true, onSelect: spies.gamma },
    'separator',
    {
      key: 'more',
      label: 'More',
      items: [
        { key: 'mono', label: 'Mono', disabled: true, onSelect: spies.mono },
        { key: 'duo', label: 'Duo', onSelect: spies.duo },
        { key: 'trio', label: 'Trio', onSelect: spies.trio },
      ],
    },
    { key: 'delta', label: 'Delta', onSelect: spies.delta },
  ]
  return { items, spies }
}

interface Opts {
  at?: { x: number; y: number }
  flip?: { x?: number; y?: number }
  onClose?: () => void
  onLeft?: () => void
  onRight?: () => void
  items?: MenuEntry[]
}

/** The menu is mounted until it asks to close, as a caller keeps it. */
function Harness({ items, at = { x: 100, y: 100 }, flip, onClose, onLeft, onRight }: Opts & { items: MenuEntry[] }) {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div>
      <button>outside</button>
      <Menu
        label="Test menu"
        items={items}
        at={at}
        flip={flip}
        onClose={() => {
          setOpen(false)
          onClose?.()
        }}
        onLeft={onLeft}
        onRight={onRight}
      />
    </div>
  )
}

function open(opts: Opts = {}) {
  const { items, spies } = fixture()
  render(<Harness items={opts.items ?? items} {...opts} />)
  return { spies }
}

/** The one row (of any menu on screen) whose text matches. */
function row(name: RegExp): HTMLElement {
  const all = [...screen.queryAllByRole('menuitem'), ...screen.queryAllByRole('menuitemcheckbox')].filter((el) => name.test(el.textContent ?? ''))
  if (all.length !== 1) throw new Error(`${all.length} rows match ${name}`)
  return all[0]
}
const key = (name: string, target: Element | Window = window) => fireEvent.keyDown(target, { key: name })
const focused = () => document.activeElement

describe('Menu rows', () => {
  beforeEach(() => {
    window.innerWidth = 800
    window.innerHeight = 600
    mockRects()
  })
  afterEach(() => vi.restoreAllMocks())

  it('is a labelled menu, fixed on the body, with its rows, ticks, details and arrows', () => {
    open()
    const menu = screen.getByRole('menu', { name: 'Test menu' })
    expect(menu.parentElement).toBe(document.body)
    expect(menu.style.position).toBe('fixed')
    expect(menu.className).toContain('z-[90]')
    expect(row(/Alpha/).textContent).toContain('Ctrl+A')
    expect(row(/Alpha/).getAttribute('role')).toBe('menuitem')
    expect(row(/Alpha/).getAttribute('aria-checked')).toBeNull()
    expect(row(/Gamma/).getAttribute('role')).toBe('menuitemcheckbox')
    expect(row(/Gamma/).getAttribute('aria-checked')).toBe('true')
    expect(row(/Gamma/).textContent).toContain('✓')
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1)
    expect(row(/More/).textContent).toContain('▸')
    expect(row(/More/).getAttribute('aria-haspopup')).toBe('menu')
    expect(row(/More/).getAttribute('aria-expanded')).toBe('false')
    expect(row(/Delta/).getAttribute('aria-haspopup')).toBeNull()
  })

  it('a checked: false row is a checkbox that is not ticked', () => {
    open({ items: [{ key: 'x', label: 'Snap', checked: false, onSelect: vi.fn<() => void>() }] })
    expect(row(/Snap/).getAttribute('role')).toBe('menuitemcheckbox')
    expect(row(/Snap/).getAttribute('aria-checked')).toBe('false')
    expect(row(/Snap/).textContent).not.toContain('✓')
  })

  it('the focus enters the menu on its first enabled row once placed', () => {
    open()
    expect(focused()).toBe(row(/Alpha/))
  })

  it('a disabled row shows its reason as the title and is not picked', () => {
    const { spies } = open()
    const beta = row(/Beta/) as HTMLButtonElement
    expect(beta.disabled).toBe(true)
    expect(beta.title).toBe('Pick something first')
    fireEvent.click(beta)
    expect(spies.beta).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeNull()
  })

  it('a pick closes everything first, then runs onSelect', () => {
    const onClose = vi.fn<() => void>()
    const { spies } = open({ onClose })
    fireEvent.click(row(/Alpha/))
    expect(spies.alpha).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(spies.alpha.mock.invocationCallOrder[0])
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('Menu keyboard', () => {
  beforeEach(() => {
    window.innerWidth = 800
    window.innerHeight = 600
    mockRects()
  })
  afterEach(() => vi.restoreAllMocks())

  it('↓ and ↑ move, skip the disabled rows and wrap', () => {
    open()
    expect(focused()).toBe(row(/Alpha/))
    key('ArrowDown')
    expect(focused()).toBe(row(/Gamma/)) // Beta is disabled
    key('ArrowDown')
    expect(focused()).toBe(row(/More/))
    key('ArrowDown')
    expect(focused()).toBe(row(/Delta/))
    key('ArrowDown')
    expect(focused()).toBe(row(/Alpha/)) // wraps
    key('ArrowUp')
    expect(focused()).toBe(row(/Delta/)) // wraps back
    key('ArrowUp')
    expect(focused()).toBe(row(/More/))
  })

  it('Home and End go to the first and the last enabled row', () => {
    open()
    key('End')
    expect(focused()).toBe(row(/Delta/))
    key('Home')
    expect(focused()).toBe(row(/Alpha/))
  })

  it('Enter and Space pick the focused row', () => {
    const { spies } = open()
    key('Enter')
    expect(spies.alpha).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    const again = open()
    key('ArrowDown')
    key(' ')
    expect(again.spies.gamma).toHaveBeenCalledTimes(1)
  })

  it('→ and Enter on a sub-menu row open it on its first enabled row', () => {
    for (const k of ['ArrowRight', 'Enter']) {
      const { unmount } = render(<Harness items={fixture().items} />)
      key('ArrowDown')
      key('ArrowDown')
      expect(focused()).toBe(row(/More/))
      key(k)
      expect(row(/More/).getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('menu', { name: 'More' })).toBeTruthy()
      expect(focused()).toBe(row(/Duo/)) // Mono is disabled
      unmount()
    }
  })

  it('← in a sub-menu closes only it and gives the focus back to its row', () => {
    const onClose = vi.fn<() => void>()
    const onLeft = vi.fn<() => void>()
    open({ onClose, onLeft })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    key('ArrowLeft')
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull()
    expect(screen.getByRole('menu', { name: 'Test menu' })).toBeTruthy()
    expect(focused()).toBe(row(/More/))
    expect(row(/More/).getAttribute('aria-expanded')).toBe('false')
    expect(onClose).not.toHaveBeenCalled()
    expect(onLeft).not.toHaveBeenCalled() // ← inside a sub-menu is not the bar's
  })

  it('Escape in a sub-menu closes only it; at the top it closes the whole menu', () => {
    const onClose = vi.fn<() => void>()
    open({ onClose })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    key('Escape')
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull()
    expect(focused()).toBe(row(/More/))
    expect(onClose).not.toHaveBeenCalled()
    key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('the Escape is the menu’s: default prevented and not seen by anything below', () => {
    open()
    const below = vi.fn<() => void>()
    document.addEventListener('keydown', below)
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => {
      row(/Alpha/).dispatchEvent(ev)
    })
    document.removeEventListener('keydown', below)
    expect(ev.defaultPrevented).toBe(true)
    expect(below).not.toHaveBeenCalled()
  })

  it('a sub-menu’s own rows are walked with the arrows and picked with Enter', () => {
    const onClose = vi.fn<() => void>()
    const { spies } = open({ onClose })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    key('ArrowDown')
    expect(focused()).toBe(row(/Trio/))
    key('ArrowDown')
    expect(focused()).toBe(row(/Duo/)) // wraps inside the sub-menu, skipping Mono
    key('Enter')
    expect(spies.duo).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('onLeft fires on ← at a top-level row; onRight on → at a row with no sub-menu, not on a sub-menu row', () => {
    const onLeft = vi.fn<() => void>()
    const onRight = vi.fn<() => void>()
    open({ onLeft, onRight })
    key('ArrowLeft')
    expect(onLeft).toHaveBeenCalledTimes(1)
    key('ArrowRight') // Alpha has no sub-menu
    expect(onRight).toHaveBeenCalledTimes(1)
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight') // More: it opens
    expect(onRight).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menu', { name: 'More' })).toBeTruthy()
    key('ArrowRight') // Duo has no sub-menu and is not top level
    expect(onRight).toHaveBeenCalledTimes(1)
  })

  it('→ and ← do nothing, and do not throw, without onLeft / onRight', () => {
    open()
    expect(() => {
      key('ArrowLeft')
      key('ArrowRight')
    }).not.toThrow()
    expect(screen.queryByRole('menu')).not.toBeNull()
  })

  it('a disabled sub-menu row does not open', () => {
    const items: MenuEntry[] = [
      { key: 'sub', label: 'Locked', disabled: true, title: 'Nothing here', items: [{ key: 'x', label: 'X', onSelect: vi.fn<() => void>() }] },
      { key: 'a', label: 'Alpha', onSelect: vi.fn<() => void>() },
    ]
    open({ items })
    expect(focused()).toBe(row(/Alpha/))
    fireEvent.click(row(/Locked/))
    expect(screen.queryByRole('menu', { name: 'Locked' })).toBeNull()
    expect((row(/Locked/) as HTMLButtonElement).title).toBe('Nothing here')
  })
})

describe('Menu pointer', () => {
  beforeEach(() => {
    window.innerWidth = 800
    window.innerHeight = 600
    mockRects()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('hovering a sub-menu row opens it after a short delay, not before', () => {
    open()
    fireEvent.mouseEnter(row(/More/))
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull()
    act(() => {
      vi.advanceTimersByTime(60)
    })
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull()
    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(screen.getByRole('menu', { name: 'More' })).toBeTruthy()
    expect(row(/More/).getAttribute('aria-expanded')).toBe('true')
  })

  it('leaving the row before the delay ends does not open it', () => {
    open()
    fireEvent.mouseEnter(row(/More/))
    fireEvent.mouseEnter(row(/Delta/))
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull()
  })

  it('moving to another row closes the open sub-menu', () => {
    open()
    fireEvent.mouseEnter(row(/More/))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('menu', { name: 'More' })).toBeTruthy()
    fireEvent.mouseEnter(row(/Delta/))
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull()
    expect(screen.queryByRole('menu', { name: 'Test menu' })).not.toBeNull()
  })

  it('a pick in a sub-menu closes all, then runs onSelect', () => {
    const onClose = vi.fn<() => void>()
    const { spies } = open({ onClose })
    fireEvent.mouseEnter(row(/More/))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    fireEvent.click(row(/Trio/))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(spies.trio).toHaveBeenCalledTimes(1)
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(spies.trio.mock.invocationCallOrder[0])
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a click on a sub-menu row opens it too (a finger has no hover)', () => {
    open()
    fireEvent.click(row(/More/))
    expect(screen.getByRole('menu', { name: 'More' })).toBeTruthy()
  })

  it('a press inside a sub-menu is inside; a press outside every menu closes all', () => {
    const onClose = vi.fn<() => void>()
    open({ onClose })
    fireEvent.mouseEnter(row(/More/))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    fireEvent.pointerDown(row(/Trio/))
    fireEvent.pointerDown(row(/Alpha/))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a menu timer left running does not fire after the menu is gone', () => {
    open()
    fireEvent.mouseEnter(row(/More/))
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(400)
      })
    }).not.toThrow()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('Menu placing', () => {
  beforeEach(() => {
    window.innerWidth = 800
    window.innerHeight = 600
  })
  afterEach(() => vi.restoreAllMocks())

  const left = (el: HTMLElement) => parseFloat(el.style.left)
  const topOf = (el: HTMLElement) => parseFloat(el.style.top)

  it('sits at `at` when it fits', () => {
    mockRects()
    open({ at: { x: 100, y: 120 } })
    const menu = screen.getByRole('menu', { name: 'Test menu' })
    expect(left(menu)).toBe(100)
    expect(topOf(menu)).toBe(120)
  })

  it('shifts inside the window without a flip, and flips to the pointer’s far side with one', () => {
    mockRects()
    const { unmount } = render(<Harness items={fixture().items} at={{ x: 780, y: 590 }} />)
    let menu = screen.getByRole('menu', { name: 'Test menu' })
    expect(left(menu) + 200).toBeLessThanOrEqual(796)
    expect(topOf(menu) + 120).toBeLessThanOrEqual(596)
    unmount()
    render(<Harness items={fixture().items} at={{ x: 780, y: 590 }} flip={{ x: 780, y: 590 }} />)
    menu = screen.getByRole('menu', { name: 'Test menu' })
    expect(left(menu)).toBe(580) // its right edge on the pointer
    expect(topOf(menu)).toBe(470) // its bottom edge on the pointer
  })

  it('a sub-menu opens beside its row’s right edge', () => {
    mockRects({ more: rect(100, 150, 200, 32) })
    open({ at: { x: 100, y: 100 } })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    const sub = screen.getByRole('menu', { name: 'More' })
    expect(left(sub)).toBe(300)
    expect(sub.style.position).toBe('fixed')
    expect(sub.parentElement).toBe(document.body)
  })

  it('a sub-menu goes to the left of its row when there is no room on the right', () => {
    window.innerWidth = 500
    mockRects({ more: rect(250, 150, 200, 32) })
    open({ at: { x: 250, y: 100 } })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    const sub = screen.getByRole('menu', { name: 'More' })
    expect(left(sub)).toBe(90) // 250 - 160
  })

  it('a sub-menu with no room on either side still stays inside the window', () => {
    window.innerWidth = 300
    mockRects({ more: rect(60, 150, 200, 32) })
    open({ at: { x: 60, y: 100 } })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    const sub = screen.getByRole('menu', { name: 'More' })
    expect(left(sub)).toBeGreaterThanOrEqual(4)
    expect(left(sub) + 160).toBeLessThanOrEqual(296)
  })

  it('a sub-menu near the window’s foot is lifted to stay inside', () => {
    mockRects({ more: rect(100, 540, 200, 32) })
    open({ at: { x: 100, y: 400 } })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    const sub = screen.getByRole('menu', { name: 'More' })
    expect(topOf(sub) + 100).toBeLessThanOrEqual(596)
    expect(topOf(sub)).toBeGreaterThanOrEqual(4)
  })

  it('a menu taller than the window is capped to it, scrolls inside, and keeps the top inside', () => {
    mockRects({}, { width: 200, height: 900 })
    open({ at: { x: 100, y: 300 } })
    const menu = screen.getByRole('menu', { name: 'Test menu' })
    expect(menu.className).toContain('max-h-[calc(100dvh-0.5rem)]')
    expect(menu.className).toContain('overflow-y-auto')
    expect(topOf(menu)).toBe(4)
  })

  it('a sub-menu is capped to the window and scrolls too', () => {
    mockRects({ more: rect(100, 150, 200, 32) })
    open({ at: { x: 100, y: 100 } })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    const sub = screen.getByRole('menu', { name: 'More' })
    expect(sub.className).toContain('max-h-[calc(100dvh-0.5rem)]')
    expect(sub.className).toContain('overflow-y-auto')
  })

  it('a scroll inside a menu or a sub-menu keeps it open; a scroll or a resize outside closes it', () => {
    mockRects({ more: rect(100, 150, 200, 32) })
    const onClose = vi.fn<() => void>()
    open({ onClose })
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowRight')
    act(() => {
      screen.getByRole('menu', { name: 'Test menu' }).dispatchEvent(new Event('scroll'))
      screen.getByRole('menu', { name: 'More' }).dispatchEvent(new Event('scroll'))
    })
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      screen.getByText('outside').dispatchEvent(new Event('scroll'))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a resize of the window closes it', () => {
    mockRects()
    const onClose = vi.fn<() => void>()
    open({ onClose })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
