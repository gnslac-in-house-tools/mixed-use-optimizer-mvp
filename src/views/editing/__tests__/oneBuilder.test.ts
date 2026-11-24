// One builder, guarded (Phase AS.4 task 7, Decision "One menu"): only `views/editing/menu/` builds a context menu's entries and puts the menu on screen; the old
// `controls/ContextMenu.tsx` is gone and nothing names it or its `ContextItem`. What the test scans: every source file of `src/` that is not a test, as text, comments
// left out (the bridge's guard, `plan/__tests__/bridgeGuard.test.ts`, reads the sources the same way). Five rules:
//   1. `controls/ContextMenu.tsx` does not exist, and no file names `ContextMenu`, `ContextItem`, `ContextMenuState` or `menuPlace`.
//   2. A file outside the folder reaches into it only by its doors: `open.tsx` (`openMenu`, `openEntries`, `MenuHost`…), `verbs.ts` (the three warehouse files that register
//      the module's kinds' runners) and `kinds/branch.ts` (Layers asks which row is a branch row: a ref's id, no entries).
//   3. Only the opener draws the `Menu` component for a right-click; the top menu bar draws it for its own menus (`MenuBar.tsx`: a click on a title, no right-click).
//   4. A right-click handler (`onContextMenu`, a `contextmenu` listener) builds no rows: it asks the opener with the `Ref`s of what is picked (`openMenu`). A file that both handles
//      a right-click and writes rows (`onSelect:` in an entry, or an import of `MenuEntry`) is an exception, named below with its reason: the two bars (the Tools strip's and the
//      docked bars') have a short list of their own that is not of a kind, and pass it to the opener (`openEntries`).
//   5. How a runner's rows are told from a view building its own menu: a file that writes `MenuEntry` rows and handles no right-click is a **runner's** only when its rows reach the
//      screen through `registerKind` (a kind's verb, `views/editing/menu/verbs.ts`): the file calls `registerKind` itself, or a file that does imports it. Those files are named below,
//      each with its reason. A file that writes rows, handles no right-click and is neither a runner's nor the menu bar's is a menu built outside the folder: refused.
// The level rail's right-click (`viewport/LevelRail.tsx`) is neither: it opens the Reference-levels box (a dialog with a switch, not a list of entries), writes no row, and needs no exception.
import { describe, expect, it } from 'vitest'
import { posix } from 'node:path'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**', '!**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })

const FOLDER = '/src/views/editing/menu/'
const OPENER = `${FOLDER}open.tsx`

/** The bars' menus: a right-click handler that writes its own short list and passes it to the opener. Not of a kind: Decision "One menu". */
const BARS: Record<string, string> = {
  '/src/views/tools/ToolStrip.tsx': 'the Tools strip’s right-click: where it docks and Hide; the strip is not a kind, so the list is its own and goes to the opener (`openEntries`)',
  '/src/views/viewport/DockedBar.tsx': 'a docked bar’s right-click: Dock above or below the viewport and Hide; not of a kind, so its short list goes to the opener (`openEntries`)',
}

/** The menu bar’s: its entries are the commands’ (a click on a title opens them), no right-click. It draws `Menu` and builds entries from the registry. */
const MENU_BAR: Record<string, string> = {
  '/src/views/commands/registry.ts': 'the top menu bar’s entries, built from the commands (`menuEntries`): a click on a title, never a right-click',
  '/src/views/layout/MenuBar.tsx': 'the top menu bar: it draws the commands’ entries with `Menu` (a click on a title), never a right-click',
}

/** The files that write `MenuEntry` rows for a kind’s runner: the rows reach the screen only through `registerKind`. Each says what rows. */
const RUNNER_ROWS: Record<string, string> = {
  '/src/modules/warehouse/views/partsMenu.ts': 'the block editor’s parts (zone, hole, court, element, edge): registers their runners itself and makes their rows (Program ▸, the element’s types…)',
  '/src/modules/terrain/views/platformCommands.ts': 'the platform’s rows of a mass’s and a building’s own verbs: `kinds/mass.ts` and `kinds/building.ts` register the runners that call it',
  '/src/views/panels/gridCommands.ts': 'the grid’s Split at a grid line rows: `kinds/grid.ts` and `kinds/mass.ts` register the runners that call it',
}

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

interface Import {
  names: string[]
  /** The specifier resolved to a path under /src (a package stays as it is). */
  from: string
}

/** The named imports of a file, types included, and the path each comes from. */
function importsOf(path: string, src: string): Import[] {
  return [...code(src).matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)].map((m) => ({
    names: m[1].split(',').map((n) => n.trim().replace(/^type\s+/, '').replace(/\s+as\s+\w+$/, '')).filter(Boolean),
    from: m[2].startsWith('.') ? posix.normalize(posix.join(posix.dirname(path), m[2])) : m[2],
  }))
}

/** Every import of a file, named or not, resolved: what a runner’s importer is found by. */
function specifiersOf(path: string, src: string): string[] {
  return [...code(src).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => (m[1].startsWith('.') ? posix.normalize(posix.join(posix.dirname(path), m[1])) : m[1]))
}

const handlesRightClick = (src: string) => /\bonContextMenu\b|['"]contextmenu['"]/.test(code(src))
/** A row of the menu written in the file: an entry’s `onSelect:` key. (Menu.tsx’s `onSelect()` is a call and a type; a widget’s prop is `onSelect={…}`.) */
const writesRows = (path: string, src: string) => /\bonSelect\s*:/.test(code(src)) || importsOf(path, src).some((i) => i.names.includes('MenuEntry') || i.names.includes('ContextItem'))
const callsRegisterKind = (src: string) => /\bregisterKind\s*\(/.test(code(src))

const outside = Object.entries(sources).filter(([path]) => !path.startsWith(FOLDER))
const names = (path: string) => path.replace('/src/', '')

describe('one builder of the right-click menu', () => {
  it('finds the sources it guards', () => {
    expect(sources[OPENER]).toBeDefined()
    expect(sources['/src/views/controls/Menu.tsx']).toBeDefined()
    expect(outside.length).toBeGreaterThan(300)
  })

  it('the old component is gone: no ContextMenu.tsx, and nothing names it, its item type, its state or its place function', () => {
    expect(sources['/src/views/controls/ContextMenu.tsx']).toBeUndefined()
    const naming = Object.entries(sources).filter(([, src]) => /\bContextMenu(State)?\b|\bContextItem\b|\bmenuPlace\b/.test(code(src))).map(([path]) => path)
    expect(naming).toEqual([])
  })

  it('outside the folder only its doors are imported: the opener, the runners’ registry (the warehouse’s), the branch rows’ id', () => {
    const DOORS = (path: string, spec: string): boolean =>
      spec === OPENER ||
      (spec === `${FOLDER}verbs.ts` && /^\/src\/modules\/warehouse\/views\/(blockMenu|menuVerbs|partsMenu)\.ts$/.test(path)) ||
      (spec === `${FOLDER}kinds/branch.ts` && path === '/src/views/layers/LayersTab.tsx')
    const offenders = outside.flatMap(([path, src]) =>
      specifiersOf(path, src)
        .filter((spec) => spec.startsWith(FOLDER) || spec.replace(/\.tsx?$/, '') === FOLDER.slice(0, -1))
        .filter((spec) => !DOORS(path, spec))
        .map((spec) => `${names(path)} → ${names(spec)}`),
    )
    expect(offenders).toEqual([])
  })

  it('only the opener, and the top menu bar for its own menus, draw the Menu component', () => {
    const drawing = Object.entries(sources)
      .filter(([path, src]) => importsOf(path, src).some((i) => i.from === '/src/views/controls/Menu.tsx' && i.names.includes('Menu')))
      .map(([path]) => path)
      .filter((path) => path !== OPENER)
    expect(drawing).toEqual(['/src/views/layout/MenuBar.tsx'])
  })

  it('a right-click handler builds no rows: it asks the opener; the two bars’ short lists are the only exceptions', () => {
    const building = outside
      .filter(([path, src]) => handlesRightClick(src) && writesRows(path, src) && path !== '/src/views/controls/Menu.tsx')
      .map(([path]) => path)
    expect(building.sort()).toEqual(Object.keys(BARS).sort())
  })

  it('the bars pass their list to the opener (`openEntries`), and nothing else outside the folder does', () => {
    const calling = outside.filter(([path, src]) => importsOf(path, src).some((i) => i.from === OPENER && i.names.includes('openEntries'))).map(([path]) => path)
    expect(calling.sort()).toEqual(Object.keys(BARS).sort())
    // and they do not draw the menu themselves: no Menu, no state of their own for it
    for (const path of Object.keys(BARS)) expect(code(sources[path]), path).not.toMatch(/useState<[^>]*Menu|<Menu\b|setMenu\(/)
  })

  it('a file that writes MenuEntry rows and handles no right-click is the menu bar’s or a runner’s: the runner’s rows go through registerKind', () => {
    const rowWriters = outside.filter(([path, src]) => importsOf(path, src).some((i) => i.names.includes('MenuEntry')) && !handlesRightClick(src))
    const runnerFiles = new Set(Object.entries(sources).filter(([, src]) => callsRegisterKind(src)).map(([path]) => path))
    /** Whether a file’s rows get to a kind’s runner: it registers one, or a file that registers one imports it. */
    const registered = (path: string) =>
      runnerFiles.has(path) || [...runnerFiles].some((r) => specifiersOf(r, sources[r]).some((spec) => spec.replace(/\.tsx?$/, '') === path.replace(/\.tsx?$/, '')))
    const refused = rowWriters.filter(([path]) => !(path in MENU_BAR) && !(path in RUNNER_ROWS && registered(path))).map(([path]) => path)
    expect(refused).toEqual([])
  })

  it('the exceptions are still needed: each file listed still does what its reason says, and has a reason', () => {
    for (const [path, why] of Object.entries({ ...BARS, ...MENU_BAR, ...RUNNER_ROWS })) {
      const src = sources[path]
      expect(src, `${path} does not exist: take it off the list`).toBeDefined()
      expect(why.length, path).toBeGreaterThan(30)
      expect(writesRows(path, src), `${path} writes no rows any more: take it off the list`).toBe(true)
    }
    for (const path of Object.keys(BARS)) expect(handlesRightClick(sources[path]), `${path} handles no right-click: take it off the list`).toBe(true)
    for (const path of [...Object.keys(MENU_BAR), ...Object.keys(RUNNER_ROWS)]) expect(handlesRightClick(sources[path]), `${path} handles a right-click: it is not a runner’s`).toBe(false)
  })

  it('counts as the test says: a comment is not an import, a type counts, a widget’s onSelect prop is not a row', () => {
    expect(writesRows('/src/a.ts', "import type { MenuEntry } from './controls/Menu.tsx'")).toBe(true)
    expect(writesRows('/src/a.ts', "// import type { MenuEntry } from './controls/Menu.tsx'")).toBe(false)
    expect(writesRows('/src/a.ts', "const row = { key: 'x', label: 'X', onSelect: () => {} }")).toBe(true)
    expect(writesRows('/src/a.tsx', '<Picker onSelect={(v) => set(v)} />')).toBe(false)
    expect(handlesRightClick('<div onContextMenu={open}>')).toBe(true)
    expect(handlesRightClick("window.addEventListener('contextmenu', f)")).toBe(true)
    expect(handlesRightClick('// onContextMenu is the plan’s')).toBe(false)
    expect(importsOf('/src/views/a.ts', "import { Menu, type MenuEntry } from './controls/Menu.tsx'")).toEqual([{ names: ['Menu', 'MenuEntry'], from: '/src/views/controls/Menu.tsx' }])
    expect(callsRegisterKind("registerKind('lot', {})")).toBe(true)
    expect(callsRegisterKind("import { registerKind } from './verbs.ts'")).toBe(false)
  })
})
