// Platforms in the views (Phase E.3b, Decision "Platforms"): a building's Platform in Properties (Balanced or Typed,
// its cut and fill, the buildings it is joined with, its steps), the menus (join another's, its own again; masses a
// step of their own and back), each platform's level on the plan, Show's Cut & fill with its legend. The demo:
// Building 1 (b1) with m1, m2 (warehouses) and m3; the ground a plane rising 5 % east.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { GroundPoint, Project, Terrain } from '../../../model/schema.ts'
import type { EarthGrid } from '../../../engine/types.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import { menuFor } from '../../editing/menu/build.ts'
import { leaf, planMenu, rowKeyed } from '../../editing/menu/__tests__/helpers.ts'
import { earthPathsOf } from '../../../modules/terrain/views/terrainDraw.ts'
import { CutFill, CutFillLegend, PlatformMarks, TerrainLayer } from '../../../modules/terrain/views/TerrainLayer.tsx'
import { useTerrainView } from '../../../modules/terrain/views/terrainView.ts'
import { showLook, useLook } from '../../viewport/look.ts'
import { PlatformSection } from '../../../modules/terrain/views/PlatformSection.tsx'

const plane = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}

const project = () => useApp.getState().project
const b1 = () => project().buildings[0]
// the Layers rows' menus are the one menu's (a building's own verbs include the platform's; a mass's *Own platform* and *Back to the building's*)
const buildingMenu = (id: string) => menuFor([{ kind: 'building', id }], 'layers')
const massMenu = (id: string) => menuFor([{ kind: 'mass', id }], 'layers')
const find = (items: ReturnType<typeof menuFor>, key: string) => rowKeyed(items, key) as (Exclude<ReturnType<typeof menuFor>[number], 'separator'> & { onSelect(): void }) | undefined

/** The demo with Building 2 (a mass east of b1's) in Option 1, on the ground or not. */
function open(ground = true) {
  let p: Project = demoProject()
  const b = actions.addBuilding(p, { optionId: 'o1' })
  p = actions.addMass(b.project, { programId: 'office', footprint: { kind: 'rect', center: { x: 500, y: 220 }, width: 100, depth: 30, rotation: 0 }, levelId: b.levelId }).project
  if (ground) p = actions.setTerrain(p, plane())
  useApp.getState().open(p)
  return b.id
}

beforeEach(() => {
  useTerrainView.getState().setShow('contours')
})

describe('a building’s Platform in Properties', () => {
  it('none without ground; balanced, its level, cut and fill; Typed keeps the level, typed in one undo step; Balanced again', () => {
    open(false)
    const { container, unmount } = render(<PlatformSection building={b1()} />)
    expect(container.textContent).toBe('')
    unmount()
    open()
    const view = render(<PlatformSection building={b1()} />)
    const own = useApp.getState().derived.earthwork!.platforms[0]
    expect(screen.getByRole('button', { name: 'Balanced' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: /^Level/ })).toBeDisabled()
    expect(screen.getByText('Cut').nextSibling!.textContent).toMatch(/^≈ [\d,]+ m³$/)
    fireEvent.click(screen.getByRole('button', { name: 'Typed' }))
    expect(b1().platform).toEqual({ level: Math.round(own.level! * 100) / 100 })
    view.rerender(<PlatformSection building={b1()} />)
    const field = screen.getByRole('textbox', { name: /^Level/ })
    fireEvent.change(field, { target: { value: '112' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(b1().platform).toEqual({ level: 112 })
    expect(screen.getByText('Balanced at')).toBeInTheDocument()
    act(() => useApp.getState().undo())
    expect(b1().platform?.level).toBe(Math.round(own.level! * 100) / 100)
    view.rerender(<PlatformSection building={b1()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Balanced' }))
    expect(b1().platform).toBeUndefined()
  })

  it('joined: it says with which, and ✕ gives it its own; a step lists its masses, its level, ✕ undoes it', () => {
    const b2 = open()
    act(() => useApp.getState().apply((p) => actions.joinPlatform(p, b2, 'b1')))
    const view = render(<PlatformSection building={b1()} />)
    expect(screen.getByText(/Joined with/).textContent).toMatch(/Building 2/)
    fireEvent.click(screen.getByRole('button', { name: 'Own platform' }))
    expect(project().buildings.find((b) => b.id === b2)!.platform).toBeUndefined()
    act(() => useApp.getState().apply((p) => actions.stepMasses(p, ['m2']).project))
    view.rerender(<PlatformSection building={b1()} />)
    expect(screen.getByText('Steps')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Level \(balanced\)/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Undo the step of Warehouse 2/ }))
    expect(b1().platform).toBeUndefined()
  })
})

describe('the menus', () => {
  it('a building joins another’s platform, or takes its own again; nothing of it without ground', () => {
    const b2 = open(false)
    expect(find(buildingMenu('b1'), 'own-platform')).toBeUndefined()
    open()
    const join = find(buildingMenu('b1'), `join:${b2}`)!
    expect(join.label).toBe('Join platform with Building 2')
    expect(find(buildingMenu('b1'), 'own-platform')!.disabled).toBe(true)
    act(() => join.onSelect())
    expect(useApp.getState().derived.earthwork!.platforms).toHaveLength(1)
    const own = find(buildingMenu('b1'), 'own-platform')!
    expect(own.disabled).toBeFalsy()
    act(() => own.onSelect())
    expect(useApp.getState().derived.earthwork!.platforms).toHaveLength(2)
  })

  it('masses: a step of their own and back, from the tree and the plan; greyed out with why', () => {
    open()
    const back = find(massMenu('m2'), 'unstep')!
    expect(back).toMatchObject({ disabled: true, title: 'They stand on their building’s platform already' })
    act(() => find(massMenu('m2'), 'step')!.onSelect())
    expect(b1().platform!.steps!.map((s) => s.masses)).toEqual([['m2']])
    expect(find(massMenu('m2'), 'step')!.disabled).toBe(true)
    act(() => useApp.getState().select('m2'))
    act(() => leaf(planMenu(), 'unstep').onSelect())
    expect(b1().platform).toBeUndefined()
  })
})

describe('the plan', () => {
  it('each platform’s level under its largest mass’s label; Cut & fill draws the graded cells and its totals', () => {
    open()
    act(() => useApp.getState().apply((p) => actions.setPlatformLevel(p, 'b1', 110)))
    const { container, rerender } = render(
      <>
        <svg>
          <TerrainLayer px={1} />
          <CutFill />
          <PlatformMarks px={1} />
        </svg>
        <CutFillLegend />
      </>,
    )
    expect(container.querySelector('[data-platform="b1"]')!.textContent).toBe('▽ 110')
    expect(container.querySelector('[data-platform="b1"]')!.getAttribute('font-weight')).toBe('600')
    expect(container.querySelector('[data-terrain="earthwork"]')).toBeNull()
    act(() => useTerrainView.getState().setShow('earthwork'))
    rerender(
      <>
        <svg>
          <TerrainLayer px={1} />
          <CutFill />
          <PlatformMarks px={1} />
        </svg>
        <CutFillLegend />
      </>,
    )
    expect(container.querySelector('[data-terrain="earthwork"] path')).not.toBeNull()
    expect(screen.getByLabelText('Cut and fill').textContent).toMatch(/Cut ≈ [\d,]+ m³Fill ≈ [\d,]+ m³/)
    act(() => useTerrainView.getState().setShow('off'))
    rerender(
      <svg>
        <PlatformMarks px={1} />
      </svg>,
    )
    expect(container.querySelector('[data-platform]')).toBeNull()
  })

  it('under a look (a specimen), its platforms’ levels and its cut and fill, not the design’s (stress test)', () => {
    open()
    act(() => useTerrainView.getState().setShow('earthwork'))
    const design = useApp.getState().project
    const specimen = actions.setPlatformLevel(design, 'b1', 112)
    act(() => showLook({ owner: 'test', title: 'Specimen #1', project: specimen, option: 'o1' }))
    const { container } = render(
      <>
        <svg>
          <CutFill />
          <PlatformMarks px={1} />
        </svg>
        <CutFillLegend />
      </>,
    )
    expect(container.querySelector('[data-platform="b1"]')!.textContent).toBe('▽ 112')
    // the platforms' and the graded roads' (a road across a bank cuts and fills: Decision "Banks meet the roads")
    const look = useLook.getState().look!.derived
    const cut = Math.round(look.earthwork!.cut + (look.roadGrading?.cut ?? 0)).toLocaleString('en-US')
    expect(screen.getByLabelText('Cut and fill').textContent).toContain(`Cut ≈ ${cut} m³`)
    expect(cut).not.toBe(Math.round(useApp.getState().derived.earthwork!.cut).toLocaleString('en-US'))
    act(() => useLook.setState({ look: null }))
  })

  it('a row’s cells of one class are one rectangle; the ground left as it is, none', () => {
    const g: EarthGrid = { x0: 0, y0: 0, size: 2, cols: 4, rows: 1, depth: new Float32Array([-2, -2, 0.1, 5]), owner: new Int32Array([0, 0, 0, 0]), kind: new Uint8Array([1, 1, 1, 1]) }
    const paths = earthPathsOf(g)
    expect(paths.cut).toEqual(['', '', 'M0.00,-2.00h4.00v2.00h-4.00Z', ''])
    expect(paths.fill).toEqual(['', '', '', 'M6.00,-2.00h2.00v2.00h-2.00Z'])
  })
})
