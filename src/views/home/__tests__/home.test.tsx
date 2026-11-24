// Home (Decision "Home"): the projects this browser keeps in a table, the sample pinned on top — open one, pick one
// for its summary on the right (any option, Open in it, duplicate, remove asked), a new one; the sample and its tour
// in the bottom strip; the summary measured when a project is kept; the top bar's GFit comes back; the address follows.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { writeBrowserCopy } from '../../../io/browserCopy.ts'
import { library } from '../../../io/library.ts'
import { parseRoute, routeHash } from '../../../io/route.ts'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import { keep, useSaving } from '../../layout/saving.ts'
import { useToast } from '../../layout/toast.ts'
import { useTour } from '../../tour/tour.ts'
import { useScreen } from '../screen.ts'
import { summarize } from '../summary.ts'
import { when } from '../ProjectsTable.tsx'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  useScreen.setState({ home: true })
  useToast.setState({ toast: null, confirmation: null })
  useTour.setState({ offer: false, active: false, index: 0 })
  useSaving.setState({ autosave: true, kept: null })
})

/** A project kept in this browser, with its summary as keep() writes it. */
const kept = (name: string, at: number) => {
  const p = { ...demoProject(), id: `p-${name}`, name }
  writeBrowserCopy(p, 'o1', at, '<svg></svg>', summarize(p, derive(p, 'o1')))
  return p
}

const table = () => screen.getByRole('region', { name: 'Your projects' })
const rowNames = () => within(table()).getAllByRole('button', { name: /^Show / }).map((b) => b.textContent)

// the sample's ground is contours (a surface made once, ~0.4 s): a full parallel run needs more than the default 5 s
describe('Home', { timeout: 15_000 }, () => {
  it('the address: # / is Home, #/p/<id> a project', () => {
    expect(parseRoute('')).toEqual({ kind: 'home' })
    expect(parseRoute('#/p/p-1')).toEqual({ kind: 'project', id: 'p-1' })
    expect(routeHash({ kind: 'project', id: 'a b' })).toBe('#/p/a%20b')
    expect(parseRoute(routeHash({ kind: 'project', id: 'a b' }))).toEqual({ kind: 'project', id: 'a b' })
  })

  it('lists the sample on top, then the kept projects newest first; Open opens one and the address names it', () => {
    kept('Older', 1000)
    const b = kept('Newer', 2000)
    render(<App />)
    expect(rowNames()).toEqual(['Industrial park', 'Newer', 'Older'])
    fireEvent.click(within(table()).getByRole('button', { name: 'Open Newer' }))
    expect(useScreen.getState().home).toBe(false)
    expect(useApp.getState().project.id).toBe(b.id)
    expect(window.location.hash).toBe(`#/p/${b.id}`)
    // back Home from the top bar
    fireEvent.click(screen.getByRole('button', { name: 'GFit' }))
    expect(useScreen.getState().home).toBe(true)
    expect(window.location.hash).toBe('#/')
  })

  it('search filters the rows', () => {
    kept('Monterrey DC', 1000)
    kept('Querétaro park', 2000)
    render(<App />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), { target: { value: 'monter' } })
    expect(rowNames()).toEqual(['Monterrey DC'])
  })

  it('a row opens its summary on the option it was left in; any other is a pick away, and Open opens it there', () => {
    const p = kept('Plant', 1000)
    const second = { ...p, options: [...p.options, { ...p.options[0], id: 'o2', name: 'B · Wider' }] }
    writeBrowserCopy(second, 'o1', 1000, '<svg></svg>', summarize(second, derive(second, 'o1')))
    render(<App />)
    fireEvent.click(within(table()).getByRole('button', { name: 'Show Plant' }))
    const summary = screen.getByRole('complementary', { name: 'Summary' })
    expect(within(summary).getByRole('button', { name: `Option: ${p.options[0].name}` })).toHaveTextContent('open last')
    expect(summary).toHaveTextContent('Built footprint')
    fireEvent.click(within(summary).getByRole('button', { name: /^Option:/ }))
    fireEvent.click(within(summary).getByRole('menuitem', { name: /B · Wider/ }))
    fireEvent.click(within(summary).getByRole('button', { name: 'Open in B' }))
    expect(useApp.getState().project.id).toBe(p.id)
    expect(useApp.getState().option).toBe('o2')
  })

  it('duplicate keeps a copy beside it; remove asks first', () => {
    kept('Plant', 1000)
    render(<App />)
    fireEvent.click(within(table()).getByRole('button', { name: 'Show Plant' }))
    const summary = () => screen.getByRole('complementary', { name: 'Summary' })
    fireEvent.click(within(summary()).getByRole('button', { name: 'Duplicate' }))
    expect(library.list().map((e) => e.name).sort()).toEqual(['Plant', 'Plant (copy)'])
    expect(library.list().every((e) => e.summary)).toBe(true)
    fireEvent.click(within(summary()).getByRole('button', { name: 'Remove' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Continue' }))
    expect(library.list().map((e) => e.name)).toEqual(['Plant (copy)'])
  })

  it('Create new (Decision "Home libraries") asks what; a project’s types but Blank, Start blank apart', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Create new' }))
    const dialog = () => screen.getByRole('dialog', { name: 'Create new' })
    expect(within(dialog()).getAllByRole('button', { pressed: false }).map((b) => b.textContent)).toEqual([expect.stringMatching(/^Project/), expect.stringMatching(/^Block/)])
    expect(within(dialog()).queryByRole('button', { name: 'Start blank' })).toBeNull()
    fireEvent.click(within(dialog()).getByRole('button', { name: /^Project/ }))
    expect(within(within(dialog()).getByRole('list', { name: 'Project types' })).getAllByRole('button').map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])).toEqual([['Industrial', 'true'], ['Uso mixto', 'false']]) // mixed-use-mvp
    expect(within(within(dialog()).getByRole('list', { name: 'Terrains' })).getByRole('button', { name: 'No terrain' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Start blank' }))
    expect(screen.queryByRole('dialog', { name: 'Create new' })).toBeNull()
    expect(useApp.getState().project).toMatchObject({ name: 'New blank project', typology: 'blank' })
  })

  it('New project opens Create new on a project; a type opens on its site, kept at once, with no tour', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(within(screen.getByRole('dialog', { name: 'Create new' })).getByRole('button', { name: /^Project/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(useScreen.getState().home).toBe(false)
    expect(useApp.getState().project.name).toBe('New industrial project')
    expect(library.list().map((e) => e.name)).toEqual(['New industrial project'])
    expect(useTour.getState()).toMatchObject({ offer: false, active: false })
  })

  it('the sidebar (Decision "Home libraries"): Projects, Blocks, Terrain, then apart From zero and About; About and Projects in the middle; Load project in the table', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Home' })
    expect(within(nav).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Projects', 'Blocks', 'Terrain', 'Learn GFit from zero', 'About'])
    expect(within(nav).getByRole('button', { name: 'Learn GFit from zero' })).toHaveTextContent('Build a project of your own, from a site drawing to a CAD plan.')
    expect(within(nav).getByRole('button', { name: 'Projects' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(nav).getByRole('button', { name: 'About' }))
    const about = screen.getByRole('region', { name: 'About' })
    expect(about).toHaveTextContent('About GFit')
    expect(within(about).getByRole('link', { name: 'Repository ↗' })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/github\.com\/.+gfit-generative-information-modeler$/))
    expect(screen.queryByRole('region', { name: 'Your projects' })).toBeNull()
    fireEvent.click(within(nav).getByRole('button', { name: 'Projects' }))
    expect(within(table()).getByRole('button', { name: 'Load project' })).toBeInTheDocument()
    expect(within(table()).queryByRole('button', { name: /Open \.gft/ })).toBeNull()
    expect(within(screen.getByRole('complementary', { name: 'Home' })).getByText('Projects are kept in this browser. File › Export › Project (.gft) takes one to another computer; Load project brings it in.')).toBeInTheDocument()
    // the sample stays in the table
    expect(rowNames()[0]).toBe('Industrial park')
  })

  it('Load project opens the file input where there is no picker', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    render(<App />)
    await act(async () => fireEvent.click(within(table()).getByRole('button', { name: 'Load project' })))
    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
  })

  it('the version at the foot of the sidebar (Decision "Release versions"): it opens About, with every version and what it brought', () => {
    const build = __GFIT_BUILD__
    render(<App />)
    const sidebar = screen.getByRole('complementary', { name: 'Home' })
    fireEvent.click(within(sidebar).getByRole('button', { name: build.version ? `Version ${build.version}` : 'A local build' }))
    const about = screen.getByRole('region', { name: 'About' })
    expect(within(about).getByRole('link', { name: 'Releases ↗' })).toHaveAttribute('href', expect.stringMatching(/gfit-generative-information-modeler\/releases$/))
    if (build.version) expect(about).toHaveTextContent(`Version ${build.version}`)
    const versions = within(about).queryByRole('list', { name: 'Versions' })
    expect(versions ? within(versions).getAllByRole('listitem', { name: /^v\d/ }).length : 0).toBe(build.versions.length)
  })

  it('the sample: Take the tour opens it and starts the tour; Open offers it', () => {
    render(<App />)
    const sample = screen.getByRole('region', { name: 'Sample project' })
    expect(sample).toHaveTextContent(/16\.5 ha.*\d+ m fall.*4 smart blocks.*3 options/)
    fireEvent.click(within(sample).getByRole('button', { name: 'Take the tour · 10 min' }))
    expect(useApp.getState().project.id).toBe('sample')
    expect(useTour.getState().active).toBe(true)
    act(() => {
      useTour.getState().exit()
      useScreen.setState({ home: true })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open the sample' }))
    expect(useTour.getState().offer).toBe(true)
  })

  it('a project kept before summaries were (the sample too) is measured once when Home lists it, and its summary kept', () => {
    writeBrowserCopy({ ...demoProject(), id: 'sample', name: 'Sample · Industrial park' }, 'o1', 1000, '<svg></svg>')
    writeBrowserCopy({ ...demoProject(), id: 'p-old', name: 'Old' }, 'o1', 2000, '<svg></svg>')
    render(<App />)
    expect(library.list().every((e) => e.summary?.options.length)).toBe(true)
    fireEvent.click(within(table()).getByRole('button', { name: 'Show Industrial park' }))
    expect(screen.getByRole('complementary', { name: 'Summary' })).toHaveTextContent('Built footprint')
  })

  it('keeping a project measures its summary: every option, its figures and issues', () => {
    act(() => useApp.getState().open(demoProject()))
    expect(keep()).toBe(true)
    const e = library.list()[0]
    expect(e.option).toBe(useApp.getState().option)
    expect(e.summary?.options.map((o) => o.id)).toEqual(useApp.getState().project.options.map((o) => o.id))
    expect(e.summary?.options[0].figures.map((f) => f.id)).toContain('built-footprint')
  })

  it('when it was kept: the time today, Yesterday, else the date', () => {
    const now = new Date(2026, 9, 28, 12).getTime()
    expect(when(new Date(2026, 9, 28, 9, 12).getTime(), now)).toBe('Today, 9:12 AM')
    expect(when(new Date(2026, 9, 27, 18).getTime(), now)).toBe('Yesterday')
    expect(when(new Date(2026, 9, 20).getTime(), now)).toBe('Oct 20')
    expect(when(null, now)).toBe('—')
  })
})
