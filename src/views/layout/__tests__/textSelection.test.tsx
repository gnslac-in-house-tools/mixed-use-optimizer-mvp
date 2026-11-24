// AS.6 (Decision "No text selected by a drag"): the frame selects nothing by a drag (`select-none` once, on <body>);
// what must stay copyable says so (`select-text` on the shared components); the icons are not dragged as images.
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import html from '../../../../index.html?raw'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { NumberField, TextField, Total } from '../../controls/fields.tsx'
import { Icon } from '../../controls/Icon.tsx'
import { Properties } from '../../panels/Properties.tsx'
import { Dialogs } from '../Dialogs.tsx'
import { Note } from '../Note.tsx'
import { ProjectDialog } from '../ProjectDialog.tsx'
import { Toast } from '../Toast.tsx'
import { useToast } from '../toast.ts'
import { useUi } from '../ui.ts'

/** The element or an ancestor below <body> says `select-text`. */
function selectable(el: Element | null): boolean {
  for (let e = el; e && e !== document.body; e = e.parentElement) if (e.classList.contains('select-text')) return true
  return false
}

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, help: true })
  useToast.setState({ toast: null, confirmation: null })
})

describe('no text selected by a drag', () => {
  it('<body> of index.html has select-none, once, as a class', () => {
    const body = /<body([^>]*)>/.exec(html)
    expect(body).not.toBeNull()
    const cls = /class="([^"]*)"/.exec(body![1])
    expect(cls?.[1].split(/\s+/)).toContain('select-none')
  })

  it('a number field and a text field stay selectable', () => {
    render(
      <>
        <NumberField label="Width" value={12} onCommit={() => {}} />
        <TextField label="Name" value="Warehouse" onCommit={() => {}} />
      </>,
    )
    expect(selectable(screen.getByLabelText('Width'))).toBe(true)
    expect(selectable(screen.getByLabelText('Name'))).toBe(true)
  })

  it("a Total's value stays selectable", () => {
    render(
      <dl>
        <Total label="Area" value="12,400 m²" />
      </dl>,
    )
    expect(selectable(screen.getByText('12,400 m²'))).toBe(true)
  })

  it("a KPI's value stays selectable", () => {
    render(<App />)
    const strip = screen.getByRole('region', { name: 'Project figures' })
    const value = strip.querySelector('span.tabular-nums > span')
    expect(value).not.toBeNull()
    expect(selectable(value)).toBe(true)
  })

  it('a Note stays selectable', () => {
    render(<Note>Drag a corner to reshape.</Note>)
    expect(selectable(screen.getByText('Drag a corner to reshape.'))).toBe(true)
  })

  it('a Note with classes of its own stays selectable', () => {
    render(<Note className="text-caption text-ink-tertiary">Its shape is its type’s.</Note>)
    const p = screen.getByText('Its shape is its type’s.')
    expect(p.classList.contains('select-text')).toBe(true)
    expect(p.classList.contains('text-ink-tertiary')).toBe(true)
  })

  it("a picked mass's Properties: the Area value and its notes stay selectable, its labels do not", () => {
    const p = demoProject()
    const mass = p.masses[0]
    useApp.setState({ selection: { massId: mass.id, vertex: null, massIds: [mass.id] } })
    render(<Properties surface="panel" />)
    const facts = screen.getByLabelText('Where it is')
    const area = [...facts.querySelectorAll('dd')].at(-1) as HTMLElement
    expect(area.textContent).toMatch(/m²/)
    expect(selectable(area)).toBe(true)
    const label = [...facts.querySelectorAll('dt')].at(-1) as HTMLElement
    expect(selectable(label)).toBe(false)
    const note = screen.getByText(/Drag a wall or a corner to resize/)
    expect(selectable(note)).toBe(true)
  })

  it("the Toast's text stays selectable", () => {
    act(() => useToast.getState().show('error', 'The site has no boundary'))
    render(<Toast />)
    expect(selectable(screen.getByText('The site has no boundary'))).toBe(true)
  })

  it("a window's body stays selectable (Dialogs.tsx, and the hand-made Project data window)", () => {
    act(() => useUi.setState({ dialog: 'rules' }))
    const { unmount } = render(<Dialogs />)
    expect(selectable(screen.getByRole('dialog', { name: 'Rules' }))).toBe(true)
    unmount()
    render(<ProjectDialog onClose={() => {}} />)
    expect(selectable(screen.getByRole('dialog'))).toBe(true)
  })

  it('an Icon says draggable="false" (a guard for later: an inline svg is not natively draggable, an <img> is)', () => {
    const { container } = render(<Icon name="close" />)
    expect(container.querySelector('svg')?.getAttribute('draggable')).toBe('false')
  })

  it('no <img> in the sources lacks draggable={false}, and none is made in code without a reason', () => {
    const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**'], { query: '?raw', import: 'default', eager: true })
    // `=>` inside a tag (an arrow function in a prop) does not end it
    const tag = /<img(?![\w-])(?:=>|[^>])*>/gs
    const made = /createElement\(\s*['"`]img['"`]|new Image\(/
    // path → why an image made in code is fine (it is never shown to be dragged); none yet
    const reasons: Record<string, string> = {}
    const bad = Object.entries(sources).flatMap(([path, text]) => [
      ...[...text.matchAll(tag)].filter((m) => !/draggable=\{false\}/.test(m[0])).map(() => path),
      ...(made.test(text) && !reasons[path] ? [path] : []),
    ])
    expect(bad).toEqual([])
  })

  it('the tag match is not fooled by an arrow in a prop', () => {
    const tag = /<img(?![\w-])(?:=>|[^>])*>/gs
    const [m] = '<img src={a} onLoad={() => go()} draggable={false} />'.matchAll(tag)
    expect(m[0]).toContain('draggable={false}')
    expect('<img src={a} onLoad={() => go()} />'.match(tag)?.[0]).not.toContain('draggable')
  })
})
