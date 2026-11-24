// A placed warehouse block on the site plan (Decision "Blocks on the site", GT.6): its module lines faint inside its
// outline and, zoomed in, its columns; what the block editor draws, put where the copy stands.
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { sampleProject } from '../../../../state/sample.ts'
import { actions } from '../../../../state/actions/index.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { PlanSvg } from '../../../../views/plan/PlanSvg.tsx'
import { copyGenerated, copyOnPlan } from '../../engine/copies.ts'
import { BlockSiteLayer, COLUMNS_FROM_SCALE } from '../BlockSiteLayer.tsx'
import { putCopyElements } from '../commands.ts'
import { bayModules } from '../../engine/dockRule.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = sampleProject()
  const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
  const copy = p.buildings.find((b) => option.buildingIds.includes(b.id) && b.warehouse)!
  useApp.setState({ project: p, derived: derive(p, option.id), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: option.id, level: copy.levels[0].id, showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
})

describe('a placed block on the site plan', () => {
  it('draws its modules faintly, inside its outline', () => {
    const { container } = render(<PlanSvg />)
    const blocks = [...container.querySelectorAll('[data-block-site]')]
    expect(blocks.length).toBeGreaterThan(0)
    for (const b of blocks) {
      const modules = b.querySelector('path[data-modules]')!
      expect(Number(modules.getAttribute('data-modules'))).toBeGreaterThan(0)
      expect(modules.getAttribute('d')).not.toBe('')
      expect(modules.getAttribute('stroke')).toBe('var(--grid-module)')
    }
  })

  /** The sample's copy with a corner dragged off its lines: an angled wall, bays cut by it. */
  function angled() {
    const { project: p, option } = useApp.getState()
    const ids = p.options.find((o) => o.id === option)!.buildingIds
    const b = p.buildings.find((x) => x.warehouse && ids.includes(x.id))!
    const levels = new Set(b.levels.map((l) => l.id))
    const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
    const ref = { kind: 'mass', id: hall.id }
    const read = actions.shapeOf(p, ref)!
    // a corner a quarter of the way to the middle: a quadrilateral, with an angled wall on each side of it
    const vs = read.contour.vertices
    const v = vs[2]
    const mid = { x: vs.reduce((s, q) => s + q.x, 0) / vs.length, y: vs.reduce((s, q) => s + q.y, 0) / vs.length }
    const w = actions.editShape(p, ref, { op: 'vertex', vertex: 2, to: { x: v.x + (mid.x - v.x) / 4, y: v.y + (mid.y - v.y) / 4 } })
    expect(w.reason).toBeUndefined()
    act(() => useApp.setState({ project: w.project, derived: derive(w.project, option) }))
    const made = w.project.buildings.find((x) => x.id === b.id)!
    const t = w.project.warehouseTypes!.find((x) => x.id === made.warehouse!.type)!
    const m = w.project.masses.find((x) => x.id === hall.id)!
    return { b, g: copyGenerated(t, copyOnPlan(t, made.warehouse!, m.footprint)) }
  }

  it('draws the clipped grid: its lines stop at an angled wall, no clip path, and a partial bay is drawn cut', () => {
    const { b, g } = angled()
    const { container } = render(
      <svg>
        <BlockSiteLayer px={1 / 5} scale={5} />
      </svg>,
    )
    const block = container.querySelector(`[data-block-site="${b.id}"]`)!
    expect(container.querySelector('clipPath')).toBeNull()
    expect(block.querySelector('[clip-path]')).toBeNull()
    expect(Number(block.querySelector('path[data-modules]')!.getAttribute('data-modules'))).toBe(g.lines.modules.length + g.lines.columns.length)
    const cut = g.cells.filter((c) => !c.whole)
    expect(cut.length).toBeGreaterThan(0)
    expect(block.querySelectorAll('[data-partial-bay]')).toHaveLength(cut.length)
  })

  it('shows its columns at every zoom: squares zoomed in, points far out', () => {
    const drawn = (scale: number) => {
      const { container, unmount } = render(
        <svg>
          <BlockSiteLayer px={1 / scale} scale={scale} />
        </svg>,
      )
      const n = [...container.querySelectorAll('[data-block-site] [data-columns]')].map((g) => ({
        count: Number(g.getAttribute('data-columns')),
        as: g.getAttribute('data-columns-as'),
        d: g.querySelector('path')?.getAttribute('d') ?? '',
      }))
      unmount()
      return n
    }
    for (const scale of [0.2, 1]) {
      const far = drawn(scale)
      expect(far.length).toBeGreaterThan(0)
      for (const c of far) {
        expect(c.count).toBeGreaterThan(0)
        expect(c.as).toBe('points')
        expect(c.d).not.toBe('')
      }
    }
    for (const c of drawn(COLUMNS_FROM_SCALE + 1)) {
      expect(c.count).toBeGreaterThan(0)
      expect(c.as).toBe('squares')
    }
  })

  it('nothing is clipped by a path: the lines are the clipped grid, the columns stand as they are', () => {
    const { container } = render(
      <svg>
        <BlockSiteLayer px={1 / 5} scale={5} />
      </svg>,
    )
    const columns = container.querySelectorAll('[data-block-site] [data-columns]')
    expect(columns.length).toBeGreaterThan(0)
    expect(container.querySelector('[clip-path]')).toBeNull()
  })

  it('draws the level doors and patterns the site’s Door and Pattern put on it (its docks are the docks layer’s)', () => {
    const { project: p, option } = useApp.getState()
    const ids = p.options.find((o) => o.id === option)!.buildingIds
    const b = p.buildings.find((x) => x.warehouse && ids.includes(x.id))!
    const t = p.warehouseTypes!.find((x) => x.id === b.warehouse!.type)!
    const levels = new Set(b.levels.map((l) => l.id))
    const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
    const g = copyGenerated(t, copyOnPlan(t, b.warehouse!, hall.footprint))
    const e = g.edges.find((x) => !g.doors.some((d) => d.edge === x.id) && bayModules(g.runs, x, 0).length > 1)!
    const [k0, k1] = bayModules(g.runs, e, 0)
    act(() => {
      putCopyElements(b.id, 'door', e.id, [k0], true)
      putCopyElements(b.id, 'pattern', e.id, [k1], true)
    })
    const { container } = render(
      <svg>
        <BlockSiteLayer px={1 / 5} scale={5} />
      </svg>,
    )
    const block = container.querySelector(`[data-block-site="${b.id}"]`)!
    expect(block.querySelectorAll('[data-kind="door"]').length).toBeGreaterThan(0)
    expect(block.querySelectorAll('[data-kind="pattern"]').length).toBeGreaterThan(0)
    expect(block.querySelectorAll('[data-kind="dock"]').length).toBe(0)
  })

  it('keeps a level door and a pattern a few pixels big far out, never gone', () => {
    const { project: p, option } = useApp.getState()
    const ids = p.options.find((o) => o.id === option)!.buildingIds
    const b = p.buildings.find((x) => x.warehouse && ids.includes(x.id))!
    const t = p.warehouseTypes!.find((x) => x.id === b.warehouse!.type)!
    const levels = new Set(b.levels.map((l) => l.id))
    const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
    const g = copyGenerated(t, copyOnPlan(t, b.warehouse!, hall.footprint))
    const e = g.edges.find((x) => !g.doors.some((d) => d.edge === x.id) && bayModules(g.runs, x, 0).length > 1)!
    const [k0, k1] = bayModules(g.runs, e, 0)
    act(() => {
      putCopyElements(b.id, 'door', e.id, [k0], true)
      putCopyElements(b.id, 'pattern', e.id, [k1], true)
    })
    const scale = 0.2 // px per m: far out
    const { container } = render(
      <svg>
        <BlockSiteLayer px={1 / scale} scale={scale} />
      </svg>,
    )
    const block = container.querySelector(`[data-block-site="${b.id}"]`)!
    const door = block.querySelector('[data-kind="door"]')!
    const n = (door.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number)
    const xs = n.filter((_, i) => i % 2 === 0)
    const ys = n.filter((_, i) => i % 2 === 1)
    const side = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    expect(side * scale).toBeGreaterThanOrEqual(3 - 1e-6)
    const mark = block.querySelector('[data-kind="pattern"]')!
    expect(Number(mark.getAttribute('r')) * scale).toBeGreaterThanOrEqual(2 - 1e-6)
  })
})
