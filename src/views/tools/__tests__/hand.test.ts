// The tool in hand (AS.2, `tools/hand.ts`): one tool at a time, the five stores that follow it written from one table, and
// every rule that drops a tool in the one file. Taken from any other tool, each value of `Hand` leaves the stores as the
// table says; `toggle` twice is Select; the ruler's points go; a block tool is refused with the 3D alone; each rule that
// drops a tool has a test; and a guard scans the sources: outside `hand.ts` (and tests) nothing writes a store's tool.
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { sampleProject } from '../../../state/sample.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useSiteBlock } from '../../../modules/warehouse/views/siteBlockState.ts'
import { useUi } from '../../layout/ui.ts'
import { useAccess, type AccessTool } from '../../plan/access/accessState.ts'
import { useSiteImport, type PendingImport } from '../../plan/site/importState.ts'
import { useSiteTool, type SiteTool } from '../../plan/site/siteTools.ts'
import { DIMENSIONS } from '../../layers/keys.ts'
import { isHidden, useLayerView } from '../../layers/layerView.ts'
import { useDimensions, useRuler, useTool, type Tool } from '../../plan/tools/toolState.ts'
import { inHand, letGo, take, toggle, useHand, type Hand } from '../hand.ts'
import type { SiteBlockTool } from '../../../modules/warehouse/views/siteBlockState.ts'

const PLAN_TOOLS: Tool[] = ['select', 'mass', 'hole', 'corner', 'chamfer', 'dimension', 'referenceLine', 'note', 'street', 'lot', 'move', 'copy', 'rotate', 'mirror', 'array', 'align']
const ACCESS: AccessTool[] = ['gate', 'existing']
const SITE: SiteTool[] = ['draw', 'place', 'heights', 'grid']
const BLOCK: SiteBlockTool[] = ['dock', 'door', 'pattern', 'court']
const EVERY: Hand[] = [...PLAN_TOOLS, 'ruler', ...ACCESS, ...SITE, ...BLOCK]

/** The five stores, as the table says they stand with `h` in hand. */
function row(h: Hand) {
  return {
    tool: (PLAN_TOOLS as string[]).includes(h) ? (h as Tool) : 'select',
    ruler: h === 'ruler',
    access: (ACCESS as string[]).includes(h) ? h : null,
    site: (SITE as string[]).includes(h) ? h : null,
    block: (BLOCK as string[]).includes(h) ? h : null,
  }
}

const stores = () => ({
  tool: useTool.getState().tool,
  ruler: useRuler.getState().active,
  access: useAccess.getState().tool,
  site: useSiteTool.getState().tool,
  block: useSiteBlock.getState().tool,
})

/** The sample's first placed block's hall: picking it makes the block tools possible. */
function blockHall() {
  const { project: p, option } = useApp.getState()
  const ids = p.options.find((o) => o.id === option)!.buildingIds
  const b = p.buildings.find((x) => x.warehouse && ids.includes(x.id))!
  const levels = new Set(b.levels.map((l) => l.id))
  return p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
}

beforeEach(() => {
  localStorage.clear()
  const p = sampleProject()
  const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
  const copy = p.buildings.find((b) => option.buildingIds.includes(b.id) && b.warehouse)!
  useApp.setState({ project: p, derived: derive(p, option.id), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: option.id, level: copy.levels[0].id, showAll: false })
  useUi.setState({ view: 'plan', dialog: null })
  useSiteImport.setState({ pending: null })
  useDimensions.setState({ selected: null, also: [] })
  useRuler.setState({ a: null, b: null })
  letGo()
})

describe('the tool in hand', () => {
  it('starts at Select, with the five stores at rest', () => {
    expect(useHand.getState().tool).toBe('select')
    expect(inHand('select')).toBe(true)
    expect(stores()).toEqual(row('select'))
  })

  it('take leaves the five stores as the table says, for every tool and from every other tool', () => {
    useApp.getState().select(blockHall().id)
    for (const from of EVERY) {
      for (const to of EVERY) {
        expect(take(from)).toBe(true)
        expect(take(to)).toBe(true)
        expect(useHand.getState().tool).toBe(to)
        expect(stores(), `${from} then ${to}`).toEqual(row(to))
        expect(inHand(to)).toBe(true)
        for (const other of EVERY) if (other !== to) expect(inHand(other)).toBe(false)
      }
    }
  })

  it('toggle twice is Select; the tool in hand again goes back to Select, another takes the hand', () => {
    useApp.getState().select(blockHall().id)
    for (const t of EVERY.filter((x) => x !== 'select')) {
      toggle(t)
      expect(inHand(t)).toBe(true)
      toggle(t)
      expect(inHand('select')).toBe(true)
      expect(stores()).toEqual(row('select'))
    }
    toggle('mass')
    toggle('street')
    expect(inHand('street')).toBe(true)
    expect(stores()).toEqual(row('street'))
  })

  it('letGo is Select, whatever is in hand', () => {
    for (const t of EVERY) {
      take(t)
      letGo()
      expect(inHand('select')).toBe(true)
      expect(stores()).toEqual(row('select'))
    }
  })

  it('the ruler’s points are cleared whenever it is taken or let go', () => {
    take('ruler')
    useRuler.setState({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } })
    letGo()
    expect(useRuler.getState()).toMatchObject({ active: false, a: null, b: null })
    take('ruler')
    useRuler.setState({ a: { x: 1, y: 2 }, b: null })
    take('mass')
    expect(useRuler.getState()).toMatchObject({ active: false, a: null, b: null })
    take('ruler')
    expect(useRuler.getState()).toMatchObject({ active: true, a: null, b: null })
  })

  it('a block tool is refused with the 3D alone: false, and nothing changed', () => {
    useApp.getState().select(blockHall().id)
    take('mass')
    useUi.setState({ view: '3d' })
    for (const t of BLOCK) {
      expect(take(t)).toBe(false)
      expect(useHand.getState().tool).toBe('mass')
      expect(stores()).toEqual(row('mass'))
    }
    // the other tools are not refused here (their commands rest on their own)
    expect(take('street')).toBe(true)
  })

  it('Dimension shows the dimensions', () => {
    useLayerView.getState().setHidden([DIMENSIONS], true)
    take('dimension')
    expect(isHidden(DIMENSIONS)).toBe(false)
  })

  it('a drawing tool taken while All levels shows takes the plan back to the active level; Select and the ruler do not', () => {
    useApp.getState().setShowAll(true)
    take('select')
    expect(useApp.getState().showAll).toBe(true)
    take('ruler')
    expect(useApp.getState().showAll).toBe(true)
    take('gate')
    expect(useApp.getState().showAll).toBe(true)
    take('mass')
    expect(useApp.getState().showAll).toBe(false)
    useApp.getState().setShowAll(true)
    take('move')
    expect(useApp.getState().showAll).toBe(false)
  })
})

describe('the rules that drop a tool', () => {
  it('All levels turned on drops a drawing tool, and keeps the others', () => {
    take('mass')
    useApp.getState().setShowAll(true)
    expect(inHand('select')).toBe(true)
    expect(stores()).toEqual(row('select'))
    take('ruler')
    useApp.getState().setShowAll(false)
    useApp.getState().setShowAll(true)
    expect(inHand('ruler')).toBe(true)
  })

  it('a block tool goes when its picked block goes', () => {
    useApp.getState().select(blockHall().id)
    take('dock')
    expect(inHand('dock')).toBe(true)
    useApp.getState().select(null)
    expect(inHand('select')).toBe(true)
    expect(stores()).toEqual(row('select'))
  })

  it('a block tool is refused with no placed block picked: false, and nothing changed', () => {
    take('mass')
    for (const t of BLOCK) {
      expect(take(t)).toBe(false)
      expect(useHand.getState().tool).toBe('mass')
      expect(stores()).toEqual(row('mass'))
    }
    useApp.getState().select(blockHall().id)
    expect(take('dock')).toBe(true)
  })

  it('a block tool goes when the view becomes the 3D alone', () => {
    useApp.getState().select(blockHall().id)
    take('court')
    useUi.setState({ view: '3d' })
    expect(inHand('select')).toBe(true)
    expect(useSiteBlock.getState().tool).toBeNull()
  })

  it('whatever is in hand goes when an import starts (the import takes the plan), and nothing else does', () => {
    const pending = { kind: 'geo' } as unknown as PendingImport
    useApp.getState().select(blockHall().id)
    for (const t of EVERY.filter((x) => x !== 'select')) {
      useSiteImport.setState({ pending: null })
      take(t)
      useSiteImport.setState({ pending })
      expect(inHand('select'), `${t} with an import starting`).toBe(true)
      expect(stores()).toEqual(row('select'))
    }
    // the import already pending: another one replacing it is not an import starting
    take('mass')
    useSiteImport.setState({ pending: { ...pending } as PendingImport })
    expect(inHand('mass')).toBe(true)
  })

  it('whatever is in hand goes when another project opens (`opened` counts them)', () => {
    useApp.getState().select(blockHall().id)
    for (const t of EVERY.filter((x) => x !== 'select')) {
      take(t)
      useApp.setState({ opened: useApp.getState().opened + 1 })
      expect(inHand('select'), `${t} with a project opening`).toBe(true)
      expect(stores()).toEqual(row('select'))
    }
  })

  it('Heights goes when the ground goes, and nothing else does', () => {
    const p = useApp.getState().project
    useApp.setState({ project: { ...p, site: { ...p.site, terrain: {} as never } } })
    take('heights')
    useApp.setState({ project: { ...useApp.getState().project, site: { ...useApp.getState().project.site, terrain: undefined } } })
    expect(inHand('select')).toBe(true)
    expect(useSiteTool.getState().tool).toBeNull()
    // Draw does not need the ground
    useApp.setState({ project: { ...p, site: { ...p.site, terrain: {} as never } } })
    take('draw')
    useApp.setState({ project: { ...useApp.getState().project, site: { ...useApp.getState().project.site, terrain: undefined } } })
    expect(inHand('draw')).toBe(true)
  })

  it('Grid goes when the grid goes (no option keeps one), in the 3D alone, and when another project opens', () => {
    const p = useApp.getState().project
    const withGrid = { ...p, grid: {} as never, options: p.options.map((o) => ({ ...o, grid: undefined })) }
    useApp.setState({ project: withGrid })
    take('grid')
    useApp.setState({ project: { ...withGrid, grid: undefined } })
    expect(inHand('select')).toBe(true)
    // an option with a grid of its own keeps the tool
    const own = { ...p, grid: {} as never, options: p.options.map((o, i) => (i === 0 ? { ...o, grid: {} as never } : o)) }
    useApp.setState({ project: own })
    take('grid')
    useApp.setState({ project: { ...own, grid: undefined } })
    expect(inHand('grid')).toBe(true)
    // the 3D alone
    useUi.setState({ view: '3d' })
    expect(inHand('select')).toBe(true)
    useUi.setState({ view: 'plan' })
    // another project opens
    take('grid')
    useApp.setState({ opened: useApp.getState().opened + 1 })
    expect(inHand('select')).toBe(true)
  })

  it('no panel tab lets a tool go: the rail picks any item and the tool in hand stays', () => {
    useApp.getState().select(blockHall().id)
    for (const t of EVERY.filter((x) => x !== 'select')) {
      for (const rail of ['layers', 'properties', 'blocks'] as const) {
        take(t)
        useUi.getState().setRail(rail)
        expect(inHand(t), `${t} with the rail on ${rail}`).toBe(true)
        expect(stores()).toEqual(row(t))
      }
    }
  })
})

// The sources, without the tests: only `tools/hand.ts` writes what the five stores hold of the tool in hand.
const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**', '!**/*.test.*'], { query: '?raw', import: 'default', eager: true })
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('who writes the tool in hand', () => {
  it('finds the sources it guards', () => {
    expect(Object.keys(sources)).toContain('/src/views/tools/hand.ts')
    expect(Object.keys(sources)).toContain('/src/views/plan/tools/toolState.ts')
  })

  it('outside tools/hand.ts and the tests, the hand itself is not written with setState either', () => {
    const wrong = Object.entries(sources)
      .filter(([path, text]) => path !== '/src/views/tools/hand.ts' && /\buseHand\.setState\b/.test(code(text)))
      .map(([path]) => path)
    expect(wrong).toEqual([])
  })

  it('outside tools/hand.ts and the tests, no store’s tool is written with setState', () => {
    const writes = [
      /\buseTool\.setState\b/,
      /\buseSiteTool\.setState\b/,
      /\buseSiteBlock\.setState\b/,
      /\buseAccess\.setState\(\s*\{[^}]*\btool\b/,
      /\buseRuler\.setState\(\s*\{[^}]*\bactive\b/,
    ]
    const wrong = Object.entries(sources)
      .filter(([path]) => path !== '/src/views/tools/hand.ts')
      .flatMap(([path, text]) => writes.filter((w) => w.test(code(text))).map((w) => `${path}: ${w}`))
    expect(wrong).toEqual([])
  })

  it('no store has a setter for its tool any more', () => {
    for (const s of [useTool, useSiteTool, useSiteBlock, useAccess, useRuler] as unknown as { getState(): Record<string, unknown> }[]) {
      expect(s.getState().setTool).toBeUndefined()
    }
    expect(useRuler.getState()).not.toHaveProperty('toggle')
  })
})
