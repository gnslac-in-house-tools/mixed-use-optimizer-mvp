// beginDrag (AS.6): a pointerdown that starts a drag cancels its default, captures the pointer, and settles the focus.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginDrag } from '../beginDrag.ts'

const press = (handle: Element, extra: Partial<{ setPointerCapture: unknown }> = {}) => {
  const e = { preventDefault: vi.fn(), pointerId: 7, currentTarget: handle, ...extra }
  beginDrag(e as never)
  return e
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('beginDrag', () => {
  it('cancels the default and captures the pointer on the handle', () => {
    const div = document.createElement('div')
    document.body.append(div)
    div.setPointerCapture = vi.fn()
    const e = press(div)
    expect(e.preventDefault).toHaveBeenCalledOnce()
    expect(div.setPointerCapture).toHaveBeenCalledWith(7)
  })

  it('survives a pointer that cannot be captured, and an element with no capture at all', () => {
    const a = document.createElement('div')
    a.setPointerCapture = () => {
      throw new DOMException('no such pointer', 'NotFoundError')
    }
    const b = document.createElement('div')
    document.body.append(a, b)
    expect(() => press(a)).not.toThrow()
    expect(press(a).preventDefault).toHaveBeenCalled()
    expect(() => press(b)).not.toThrow()
  })

  it('a given target captures instead of the handle', () => {
    const svg = document.createElement('div')
    const bubble = document.createElement('div')
    svg.setPointerCapture = vi.fn()
    bubble.setPointerCapture = vi.fn()
    document.body.append(svg, bubble)
    beginDrag({ preventDefault() {}, pointerId: 3, currentTarget: bubble } as never, svg)
    expect(svg.setPointerCapture).toHaveBeenCalledWith(3)
    expect(bubble.setPointerCapture).not.toHaveBeenCalled()
  })

  it('a focusable handle takes the focus', () => {
    const input = document.createElement('input')
    const handle = document.createElement('div')
    handle.tabIndex = 0
    document.body.append(input, handle)
    input.focus()
    press(handle)
    expect(document.activeElement).toBe(handle)
  })

  it('a handle that cannot be focused blurs the field being edited (it saves on blur)', () => {
    const input = document.createElement('input')
    const onBlur = vi.fn()
    input.addEventListener('blur', onBlur)
    const handle = document.createElement('div')
    document.body.append(input, handle)
    input.focus()
    expect(document.activeElement).toBe(input)
    press(handle)
    expect(document.activeElement).not.toBe(input)
    expect(onBlur).toHaveBeenCalledOnce()
  })

  it('a handle that cannot be focused gives the focus to its nearest focusable ancestor, a tabindex of -1 too', () => {
    const input = document.createElement('input')
    const section = document.createElement('section')
    section.tabIndex = -1
    const inner = document.createElement('div')
    const handle = document.createElement('div')
    inner.append(handle)
    section.append(inner)
    document.body.append(input, section)
    input.focus()
    press(handle)
    expect(document.activeElement).toBe(section)
  })

  it('a disabled button handle is not focusable: the field being edited is blurred', () => {
    const input = document.createElement('input')
    const onBlur = vi.fn()
    input.addEventListener('blur', onBlur)
    const button = document.createElement('button')
    button.disabled = true
    document.body.append(input, button)
    input.focus()
    press(button)
    expect(document.activeElement).not.toBe(input)
    expect(document.activeElement).not.toBe(button)
    expect(onBlur).toHaveBeenCalledOnce()
  })
})
