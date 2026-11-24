// The tutorials' texts (Decisions "Tools strip", "No areas", "Layers", "Panel tabs", "One menu", "Blocks are picked"): there are no
// steps to open, no tools bar, no rail and no Brief, Site, Levels or Flow tab. A tool is found in the Tools strip by its group, a
// thing in Layers by its branch, a setting in Properties after its row is picked, a site command in the Site menu; a block card
// picks with a click and is placed by a drag or by Place in its right-click menu; there is one right-click menu (no plan, tree or
// program menu of its own) and no On the site chips in Blocks. So no step's text names what is gone, and every anchor that points
// at a tool, a tab, a row or a block card is one the app draws when its step shows. Phase D.1 adds: a wall, a court's depth or a corner's
// number is typed beside its handle (the Shape engine's and the court pills'), so no text says it is typed in the command line only.
// Phase D.2 adds: there are no free masses, Draw makes a block, a block's outline is free and the module lines a snap, so no text says a
// wall moves "by whole modules", names a "Mass tool" or a mass drawn, or puts a block's outline on the module lines.
import { readFileSync } from 'node:fs'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { sampleProject } from '../../../state/sample.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { registerAll } from '../../commands/index.ts'
import { commandOf } from '../../commands/registry.ts'
import { PROJECT_VERSION } from '../../../model/schema.ts'
import { SNAP_TO_NAMES } from '../../plan/snap/kinds.ts'
import { TOOLS } from '../../plan/tools/toolState.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { STEPS } from '../steps.ts'
import type { TourStep } from '../tour.ts'
import { ZERO_STEPS } from '../zero/index.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/**
 * What the app no longer has, as a text would name it. View › Overlays is still a menu: only the drafting bar's Overlays ▾
 * (and an "Overlays menu" of it) is gone, so "Overlays" alone is allowed.
 */
const OLD = [
  /\b(Site|Massing|Flow) step\b/i,
  /tools bar/i,
  /area panel/i,
  /\brail\b/i,
  /\b(Brief|Site|Levels|Flow|Settings) tabs?\b/i,
  /\bOverlays ▾/,
  /\bOverlays (menu|chips?|button)\b/i,
  /Drawing layers/,
  // Phase AS.4: a click on a block card picks it and places nothing; the menus are one; Blocks' chips went to the Tools strip
  /\bA click places\b/i,
  /\bclick (a|the|on a) (block )?card\b[^.]*\bplace/i,
  /\bOn the site (chips?|buttons?)\b/i,
  /\b(Add to|Take out of) the selection\b/i,
  /\b(plan|tree|program) menus?\b/i,
  // Phase AS.5: the Snap ▾'s entry for the site's imported drawings reads Drawing lines (Reference lines is the guides drawn on the plan);
  // a group is of any kind; the Reference branch of Layers has the guides
  /\breference drawings\b/i,
  // the imported drawings' lines are *drawing lines* (as Snap ▾ says); "reference lines and parcels" was what a drawing was kept for
  /\breference lines? (and|or) parcels\b/i,
  /\bgroups? (of )?masses\b|\bgroup(s|ed)? (the )?(selected |picked )?masses\b/i,
  /\bReference lines? come with\b/i,
  // Phase D.1 (Decision "Typed dimension"): a number for a wall, a face, a corner, a court's depth or a hole is typed beside the handle,
  // during the drag or right after it; the command line is for the tools (Rotate, Move, Copy…) and mirrors it, it is not the only place
  /\b(wall|face|corner|court|depth|hole|chamfer)s?\b[^.;]*\b(typed|type|enter)\b[^.;]*\bin the command line\b/i,
  /\b(typed|type|enter)\b[^.;]*\b(wall|face|corner|court|depth|hole|chamfer)s?\b[^.;]*\bin the command line\b/i,
  /\bin the command line\b[^.;]*\b(only|alone)\b[^.;]*\b(wall|face|corner|court|depth|hole)\b/i,
  // Phase D.2 (Decisions "Draw makes a block", "Outline in metres"): Draw makes a block, never a free mass; a block's outline is free
  // (any angle, curves, chamfers) and the module lines are a snap (Shift: free), so its walls do not move "by whole modules"
  /\bMass tool\b/i,
  /\b(draw|draws|drawing|drawn)\b[^.;]*\ba (new |free |plain )?mass\b|\ba mass (is |gets )?(drawn|made)\b|\ba picked mass\b/i,
  /\b(pills?|walls?)\b[^.;]*\bby whole modules\b/i,
  /\boutline\b[^.;]*\bon the module lines\b/i,
]
const TUTORIALS: [string, TourStep[]][] = [
  ['the sample tour', STEPS],
  ['From zero', ZERO_STEPS],
]

/** Every string a step can show: its title, paragraphs, why, its button's label. (Getters are read here.) */
const textsOf = (s: TourStep): string[] => [s.title, ...s.body, ...(s.why ? [s.why] : []), ...(s.action ? [s.action.label] : [])]
/** Tabs of the left panel and rows of Layers: the anchors this guard shows on screen. */
const isPanelAnchor = (a: string | undefined): a is string => !!a && /^(layer|tab)-/.test(a)

beforeEach(() => {
  localStorage.clear()
  registerAll()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), option: 'o1' })
})

describe.each(TUTORIALS)('%s: no text names what is gone', (_name, steps) => {
  it('no step, area, rail, tools bar or old tab: tools are in the strip, things in Layers, settings in Properties', () => {
    for (const s of steps) for (const text of textsOf(s)) for (const old of OLD) expect(text, `${s.id}: ${old}`).not.toMatch(old)
  })

  it('an anchor on a tool is a command of the strip', () => {
    for (const s of steps.filter((x) => x.anchor?.startsWith('tool-'))) {
      const id = s.anchor === 'tool-group' ? 'edit.group' : s.anchor!.replace(/^tool-/, 'tool.')
      expect(commandOf(id)?.tool, `${s.id}: ${s.anchor}`).toBeDefined()
    }
  })

  it('a text that speaks of what Snap ▾ snaps to names the entries as the menu does (Drawing lines, Reference lines, Contours)', () => {
    const snap = steps.filter((s) => s.anchor === 'snap') // the sample tour has no such step
    if (steps === ZERO_STEPS) expect(snap.length).toBeGreaterThan(0)
    for (const s of snap) {
      const text = textsOf(s).join(' ')
      if (/snaps? to\b/i.test(text)) for (const name of Object.values(SNAP_TO_NAMES)) expect(text, `${s.id}: ${name}`).toContain(name)
    }
  })
})

describe('the General group: the tours say what the tools work on without leaving a kind out', () => {
  it('From zero’s Move step names the new kinds the tools act on (dimensions, reference lines, notes)', () => {
    const why = ZERO_STEPS.find((s) => s.id === 'zero-move')?.why ?? ''
    for (const word of ['dimensions', 'reference lines', 'notes']) expect(why, word).toContain(word)
  })
})

describe('the Layers texts of the docs: no Reference branch without guides', () => {
  const arch = readFileSync('docs/ARCHITECTURE.md', 'utf8')
  it('ARCHITECTURE.md does not say that reference lines are for later, or that the Reference branch has no eye', () => {
    expect(arch).not.toMatch(/reference lines come with AS\.5/i)
    expect(arch).not.toMatch(/Reference lines take the same toggle when AS\.5 makes them/i)
    expect(arch).not.toMatch(/the Reference branch, which holds only the Grid, has no eye/i)
  })
  it('the Decisions of Phase AS.5 are there, each one the plan’s call', () => {
    for (const name of ['Mirror, Array, Align', 'Groups of any kind', 'Reference lines', 'Notes', 'Version 15']) {
      const row = arch.split('\n').find((l) => l.startsWith('| 2026-11-15 | ' + name + ' |'))
      expect(row, name).toBeDefined()
      expect(row, name).toMatch(/the plan's call/)
    }
  })
})

describe('the guard itself', () => {
  const caught = (text: string) => OLD.some((old) => old.test(text))
  it('catches what Task 6 left in prose, and lets View › Overlays be', () => {
    for (const text of [
      'the rail',
      'in the Site tab’s Drawing layers (+ Add drawing…)',
      'Site tab',
      'the Flow tab',
      'Brief tab',
      'the Levels tab',
      'Open Overlays ▾ in the drafting bar',
      'the Overlays menu of the bar',
      '(A click places it in the middle of what can be built.)',
      'Click a card to place a copy, or drag it onto the plan',
      'the On the site chips of Blocks',
      'Add to the selection',
      'the plan menu',
      'Snap ▾ chooses what it snaps to, reference drawings and contours among them',
      'Group the masses you want to move as one',
      'Reference lines come with the next phase',
      'Type the wall’s distance in the command line',
      'A court’s depth is typed in the command line',
      'In the command line alone you can type the number of a corner',
      'Draw it with the Mass tool',
      'B draws a mass',
      'A picked mass has a pill on each wall',
      'A pill on every wall moves it by whole modules',
      'a placed block’s walls move by whole modules',
      'shape: its outline on the module lines (a bay pulled out or pushed in)',
    ])
      expect(caught(text), text).toBe(true)
    for (const text of [
      'View › Overlays adds what you want to see over it',
      'Open Layers, the tab on the left',
      'Brief › Circulation',
      'the Properties tab',
      'Drag it onto the site, or right-click it and choose Place',
      'In the Elements group of the Tools strip, pick Dock',
      'Group what is picked, of any kind',
      'Snap ▾ chooses Drawing lines, Reference lines and Contours',
      'Type an angle in the command line under the plan for an exact one',
      'Type the number beside the handle and press Enter',
      'B draws a block',
      'Its outline is free: the module lines are a snap, and Shift moves it free',
      'With smart blocks it varies each copy: its box’s length and width by whole modules (its inner walls keep their distance)',
      'Docks, doors and patterns go on walls along the grid',
    ])
      expect(caught(text), text).toBe(false)
  })
})

describe.each(TUTORIALS)('%s: the tabs and rows its steps point at are on screen', { timeout: 30_000 }, (_name, steps) => {
  it('each layer-… and tab-… anchor is drawn when its step shows', async () => {
    useScreen.setState({ home: false })
    useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
    useToast.setState({ toast: null, confirmation: null })
    render(<App />)
    for (const s of steps.filter((x) => isPanelAnchor(x.anchor))) {
      act(() => s.before?.())
      await waitFor(() => expect(document.querySelector(`[data-tour="${s.anchor}"]`), `${s.id}: [data-tour="${s.anchor}"]`).not.toBeNull())
    }
  })
})

describe('Blocks: the card the tutorials point at, and what its tab says', { timeout: 30_000 }, () => {
  beforeEach(() => {
    const p = sampleProject()
    useApp.setState({ project: p, derived: derive(p, p.options[0].id), history: emptyHistory(), option: p.options[0].id })
    useScreen.setState({ home: false })
    useUi.setState({ dialog: null, view: 'plan', rail: 'blocks', panels: { left: true, right: true }, sheet: null, help: true })
    useToast.setState({ toast: null, confirmation: null })
  })

  it('block-card is a card of Blocks and new-block its button; the tab says a drag or Place puts a copy, and has no chips', () => {
    render(<App />)
    const panel = screen.getByRole('tabpanel', { name: 'Blocks' })
    expect(panel.querySelector('[data-tour="block-card"]')).not.toBeNull()
    expect(panel.querySelector('[data-tour="new-block"]')).not.toBeNull()
    expect(panel.textContent).toMatch(/right-click it and choose Place/)
    expect(panel.textContent).not.toMatch(/\bclick(ing)? (it |a card |a block )?to place\b/i)
    // Dock, Door, Pattern and Court are the Tools strip's (Elements group), not buttons of this tab
    for (const name of ['Dock', 'Door', 'Pattern', 'Court']) expect(within(panel).queryByRole('button', { name }), name).toBeNull()
    expect(within(panel).queryByText('On the site')).toBeNull()
  })
})

describe('Phase D.1: the Massing group has Chamfer, and the number is typed beside the handle', () => {
  const step = (id: string, steps: TourStep[]) => steps.find((s) => s.id === id)
  const text = (s: TourStep | undefined) => (s ? textsOf(s).join(' ') : '')

  it('the sample tour has a step on the Chamfer tool, a command of the Massing group, that names Corner, Massing and the number beside the handle', () => {
    const s = step('shape', STEPS)
    expect(s?.anchor).toBe('tool-chamfer')
    expect(commandOf('tool.chamfer')?.tool?.group).toBe('massing')
    expect(commandOf('tool.corner')?.tool?.group).toBe('massing')
    const all = text(s)
    for (const word of ['Massing', 'Corner', 'Chamfer', 'beside the handle', 'Enter', 'Shift+F']) expect(all, word).toContain(word)
    expect(all).toMatch(/one undo step/i)
  })

  it('no tour text names Corner or Chamfer as a tool of a group that is not Massing', () => {
    for (const [name, steps] of TUTORIALS)
      for (const s of steps) {
        const all = text(s)
        if (!/\b(Corner|Chamfer) tool\b|\b(Corner|Chamfer)\b[^.]*\bgroup\b/.test(all)) continue
        expect(all, `${name}: ${s.id}`).toMatch(/Massing/)
        expect(all, `${name}: ${s.id}`).not.toMatch(/\b(General|Elements|Streets|Parking|Annotations) group\b[^.]*\b(Corner|Chamfer)\b|\b(Corner|Chamfer)\b[^.]*\b(General|Elements|Streets|Parking|Annotations) group\b/)
      }
  })

  it('From zero says where a number is typed for Rotate and for a truck court: beside the handle or pill, not only the command line', () => {
    expect(text(step('zero-rotate', ZERO_STEPS))).toMatch(/beside the rotation handle/)
    expect(text(step('zero-rotate', ZERO_STEPS))).toMatch(/command line/)
    expect(text(step('zero-site-court', ZERO_STEPS))).toMatch(/type .*beside it|beside the pill/i)
  })
})

describe('Phase D.1: the docs say what landed', () => {
  const arch = readFileSync('docs/ARCHITECTURE.md', 'utf8')
  const row = (name: string) => arch.split('\n').find((l) => l.startsWith('| 2026-11-16 | ' + name + ' |'))

  it('the Decisions of the Shape engine, the Chamfer, the Typed dimension, A block before D.2 and Version 16 are there, each the plan’s call', () => {
    for (const name of ['Shape engine', 'Chamfer', 'Typed dimension', 'A block before D.2', 'Version 16']) {
      expect(row(name), name).toBeDefined()
      expect(row(name), name).toMatch(/the plan's call/)
    }
  })
  it('the user’s four decisions of 2026-11-16 on project D are one row, recorded as the user’s', () => {
    const r = row('Project D scope')
    expect(r).toBeDefined()
    expect(r).toMatch(/the user, 2026-11-16/)
    expect(r).not.toMatch(/the plan's call/)
    for (const word of ['D.1', 'D.2', 'D.3', 'free', 'a shape of its own', 'parallel to the grid']) expect(r, word).toContain(word)
  })
  it('the notes of Block shape and Everything is a block point at D.1', () => {
    for (const name of ['Block shape', 'Everything is a block']) {
      const l = arch.split('\n').find((x) => x.includes('| ' + name + ' |'))
      expect(l, name).toMatch(/Phase D\.1|D\.1/)
    }
  })
  it('Layers names editing/shape/ and editing/dimension/, the Kinds section says what each kind’s shape refuses', () => {
    expect(arch).toContain('`shape/`')
    expect(arch).toContain('`dimension/`')
    const kinds = arch.split(/^## /m).find((s) => s.startsWith('Kinds')) ?? ''
    expect(kinds).toMatch(/Shape engine/)
    for (const id of ['mass', 'mass-hole', 'block-type']) expect(kinds, id).toContain('`' + id + '`')
  })
  it('Phases has project D of the native engines’ queue after AS: D.1, D.2 and D.3 done, and the old D. Demo kept', () => {
    expect(arch).toMatch(/^- \[x\] \*\*D\. Blocks on the engines\*\*/m)
    expect(arch).toMatch(/^ {2}- \[x\] D\.1 /m)
    expect(arch).toMatch(/^ {2}- \[x\] D\.2 /m)
    expect(arch).toMatch(/^ {2}- \[x\] D\.3 /m)
    expect(arch).toMatch(/^- \[x\] \*\*D\. Demo:/m)
    expect(arch.indexOf('**D. Blocks on the engines**')).toBeGreaterThan(arch.indexOf('AS.5 Mirror, Array, Align'))
    expect(arch).not.toMatch(/HANDOFF/)
  })
  it('docs/tour.md lists tool-chamfer among its anchors', () => {
    expect(readFileSync('docs/tour.md', 'utf8')).toContain('`tool-chamfer`')
  })
})

describe('Phase D.2: the docs say what landed', () => {
  const arch = readFileSync('docs/ARCHITECTURE.md', 'utf8')
  const row = (name: string) => arch.split('\n').find((l) => l.startsWith('| 2026-11-16 | ' + name + ' |'))

  it('the Decisions of D.2 are there, each the plan’s call', () => {
    for (const name of ['Outline in metres', 'Clipped grid', 'Draw makes a block', 'Free masses migrate', 'Version 17']) {
      expect(row(name), name).toBeDefined()
      expect(row(name), name).toMatch(/the plan's call/)
    }
  })
  it('the user’s two answers are recorded as his: Draw makes a block (Q1) and the open programs (Q2)', () => {
    const r = row('Draw makes a block') ?? ''
    expect(r).toMatch(/the user, 2026-11-16/)
    expect(r).toMatch(/Outdoor storage/)
    expect(r).toMatch(/DrawWarehouse/)
  })
  it('Warehouse by drawing says it retired, and no file the plan removed is named as current', () => {
    const l = arch.split('\n').find((x) => x.includes('| Warehouse by drawing |')) ?? ''
    expect(l).toMatch(/retired/i)
    expect(l).toMatch(/Draw makes a block/)
    expect(arch).not.toMatch(/`engine\/draw\.ts`/)
  })
  it('the notes of Block shape, A block before D.2, Everything is a block and Elements by module point at D.2', () => {
    for (const name of ['Block shape', 'A block before D.2', 'Everything is a block', 'Elements by module']) {
      const l = arch.split('\n').find((x) => x.includes('| ' + name + ' |'))
      expect(l, name).toMatch(/D\.2/)
    }
    expect(arch.split('\n').find((x) => x.includes('| A block before D.2 |'))).toMatch(/replaced by D\.2|D\.2 (swapped|replaced)/)
  })
  it('Layers names the legacy engine, blocks.ts, massesToBlocks.ts and outlineOp.ts; Kinds says a block’s outline is free', () => {
    const layers = arch.split(/^## /m).find((s) => s.startsWith('Layers')) ?? ''
    for (const name of ['legacy/', 'blocks.ts', 'massesToBlocks.ts', 'outlineOp.ts']) expect(layers, name).toContain(name)
    const kinds = arch.split(/^## /m).find((s) => s.startsWith('Kinds')) ?? ''
    expect(kinds).toMatch(/free outline|outline is free/i)
  })
  it('Phases lists D.2 as done, one line per task, with the plan named', () => {
    expect(arch.split('\n').filter((l) => /D\.2 task \d+ landed/.test(l))).toHaveLength(9)
    expect(arch).toContain('docs/superpowers/plans/2026-11-16-phase-d2-everything-is-a-block.md')
    for (const hash of ['a6c0839', '9d4dff5', 'fd4e2a7', 'd9f052b', 'ff7e9e4', '01aa6ca', '582e542', 'd1e94d0']) expect(arch, hash).toContain(hash)
  })
  it('the Brief’s help says Draw, not the Mass tool', () => {
    expect(readFileSync('src/views/brief/columns.tsx', 'utf8')).not.toMatch(/Mass tool/)
  })
})

describe('Phase D.3: the docs say what landed', () => {
  const arch = readFileSync('docs/ARCHITECTURE.md', 'utf8')
  const row = (name: string) => arch.split('\n').find((l) => l.startsWith('| 2026-11-17 | ' + name + ' |'))
  it('the Decisions of D.3 are there, each the plan’s call, and the user’s answers are his', () => {
    for (const name of ['Court shape', 'Courts in the circulation', 'On edge engine', 'Split', 'Version 18']) {
      expect(row(name), name).toBeDefined()
      expect(row(name), name).toMatch(/the plan's call/)
    }
    expect(row('Project D, answers of the user')).toMatch(/the user, 2026-11-17/)
    expect(row('Split')).toMatch(/Split takes a truck court for now/)
    // Rotate 90° never moved (review S6): it is Shift+R, and no doc says an E key for it
    expect(commandOf('edit.rotate90')?.key).toBe('Shift+R')
    expect(row('Split')).toMatch(/Rotate 90° stays Shift\+R/)
    expect(arch).not.toMatch(/Rotate 90° moved|Rotate 90° in the block editor is/)
    expect(readFileSync('docs/tour.md', 'utf8')).not.toMatch(/Rotate 90° in the block editor is/)
    // the frozen legacy rings were edited on purpose, and the Decision says why
    expect(row('Split')).toMatch(/legacy\/rings\.ts.*flaring past its wall/)
  })
  it('Layers names the On edge engine, the court rules and the guard', () => {
    const layers = arch.split(/^## /m).find((s) => s.startsWith('Layers')) ?? ''
    for (const name of ['edge/', 'geom/split.ts', 'courts.ts', 'dockRule.ts', 'blockEdgeHost.ts', 'SiteBlockTools.tsx', 'oneEdgeEngine.test.ts']) expect(layers, name).toContain(name)
  })
  it('Phases lists D.3 as done, one line per task, with the plan named', () => {
    expect(arch.split('\n').filter((l) => /D\.3 task \d+ landed/.test(l))).toHaveLength(12)
    expect(arch).toContain('docs/superpowers/plans/2026-11-17-phase-d3-courts-docks-engines.md')
  })
})

describe('Phase PE.1: the texts say how a street’s width is set', () => {
  const read = (f: string) => readFileSync(f, 'utf8')
  it('the tours say a type gives a new street’s width and the pills pull each side', () => {
    const flow = read('src/views/tour/zero/flow.ts')
    expect(flow).toMatch(/gives a new street’s width/)
    expect(flow).not.toMatch(/gives its width/)
    expect(read('src/views/tour/steps.ts')).toMatch(/a pill on each side of a street pulls that side \(Shift the whole street, Ctrl/)
  })
  it('no text says a street’s width is set in Properties or has a width handle', () => {
    for (const f of ['src/views/tour/steps.ts', 'src/views/tour/zero/flow.ts', 'docs/tour.md', 'docs/mcp.md']) {
      expect(read(f), f).not.toMatch(/street’s width (is set|in) Properties|Properties’ Width on a picked street|width handles/i)
    }
  })
  it('the decisions of PE.1 are there and Phases lists its thirteen tasks', () => {
    const arch = read('docs/ARCHITECTURE.md')
    for (const name of ['Project E, answers of the user', 'Path engine', 'Street sides', 'Joins as one', 'Street links', 'The street a person picks', 'Width by hand', 'Version 19']) {
      expect(arch, name).toContain('| 2026-11-18 | ' + name + ' |')
    }
    expect(arch.split('\n').filter((l) => /PE\.1 task \d+ landed/.test(l))).toHaveLength(13)
    expect(arch).toMatch(/- \[x\] PE\.1 /)
  })
})

describe('Phase PE.2: the texts say lanes, no frontage, gates on any street, an existing street moved', () => {
  const read = (f: string) => readFileSync(f, 'utf8')
  const arch = read('docs/ARCHITECTURE.md')
  const row = (name: string) => arch.split('\n').find((l) => l.startsWith('| 2026-11-19 | ' + name + ' |')) ?? ''
  const flow = (id: string) => ZERO_STEPS.find((s) => s.id === id)
  const all = (s: TourStep | undefined) => (s ? textsOf(s).join(' ') : '')

  it('the tours say a lane pill adds or takes a lane, each lane line is dragged or typed, and Equal lanes is a verb', () => {
    const streets = all(STEPS.find((s) => s.id === 'streets'))
    expect(streets).toMatch(/pill with the lane count adds or takes a lane/)
    expect(streets).toMatch(/lane line is dragged or typed/)
    expect(streets).toMatch(/Equal lanes/)
    expect(all(flow('zero-street'))).toMatch(/lane pill adds or takes lanes/)
  })

  it('the tours say a gate goes on the boundary or on either side of any street, and an existing street is picked and moved', () => {
    expect(all(flow('zero-gate'))).toMatch(/click the boundary where the street comes in, or a side of any street/)
    expect(all(flow('zero-gate'))).toMatch(/stands on the boundary or on a side of any street, drawn or existing/)
    expect(all(STEPS.find((s) => s.id === 'streets'))).toMatch(/An existing street is picked on the plan, moved, turned and locked like a block/)
    expect(all(flow('zero-move'))).toMatch(/streets, existing streets, lots, gates/)
  })

  it('no tour text, doc or Help text names a frontage, or says a gate stands only on the boundary', () => {
    for (const [name, steps] of TUTORIALS) for (const s of steps) expect(textsOf(s).join(' '), `${name}: ${s.id}`).not.toMatch(/frontage|only on the (site’s )?boundary/i)
    expect(read('docs/tour.md')).not.toMatch(/frontage/i)
    // docs/mcp.md names the three tools that went, in its PE.2 section alone
    const mcp = read('docs/mcp.md')
    expect(mcp.replace(/### Streets \(Phase PE\.2\)[\s\S]*?(?=\n### )/, '')).not.toMatch(/frontage/i)
    for (const f of ['src/views/tour/steps.ts', 'src/views/tour/zero/flow.ts', 'src/views/plan/tools/toolState.ts']) expect(read(f), f).not.toMatch(/frontage/i)
  })

  it('a tool’s hint says the lane pill, and none ends in a closing bracket', () => {
    expect(TOOLS.find((t) => t.key === 'street')?.hint).toMatch(/the lane pill adds or takes a lane/)
    // the strip adds the key in brackets to a hint: one that ends in a bracket would read "(…) (S)"
    for (const t of TOOLS) expect(t.hint, t.key).not.toMatch(/\)$/)
  })

  it('ARCHITECTURE.md names a frontage only in what is history: a Decisions row that says PE.2 or superseded, or Phases', () => {
    const lines = arch.split('\n')
    const phases = lines.findIndex((l) => l.startsWith('## Phases'))
    const stray = lines.flatMap((l, i) => (i < phases && /frontage/i.test(l.replaceAll('No frontage', '')) && !(l.startsWith('| 20') && /PE\.2|superseded/.test(l)) ? [l.slice(0, 90)] : []))
    expect(stray).toEqual([])
  })

  it('the Decisions of PE.2 are there, each the plan’s call, and say what the code does', () => {
    for (const name of ['Lanes', 'No frontage', 'Gates on any street', 'Existing streets transformed', 'Version 20']) {
      expect(row(name), name).not.toBe('')
      expect(row(name), name).toMatch(/the plan's call/)
    }
    expect(row('Lanes')).toMatch(/Q8/)
    expect(row('Lanes')).toMatch(/Q9/)
    for (const word of ['lanes.ts', '`line`', '`lane-widths`', 'MIN_LANE', 'data-path-lanes', '--road-lane', 'Equal lanes']) expect(row('Lanes'), word).toContain(word)
    expect(row('No frontage')).toMatch(/Q6/)
    expect(row('No frontage')).toMatch(/Q7/)
    for (const word of ['migrateSite', 'perimeterPath', 'noFrontage.test.ts', 'boundaryRoads', '-street']) expect(row('No frontage'), word).toContain(word)
    for (const word of ['Gate.on', 'GATE_SLOT', 'followGates', '`boundary`', 'gateEdges.ts', 'Its gates went with it', 'gateHostAt']) expect(row('Gates on any street'), word).toContain(word)
    for (const word of ['Picked.existing', 'moveExistingRoads', 'mirrorExistingRoads', 'copyExistingRoads', 'lockExistingRoads', 'data-road-kind']) expect(row('Existing streets transformed'), word).toContain(word)
    expect(row('Version 20')).toContain('`PROJECT_VERSION` is 20')
    expect(PROJECT_VERSION).toBe(20)
    expect(arch).toMatch(/\| 2026-11-18 \| Project E, answers of the user \|[^\n]*PE\.2: built as/)
  })

  it('Phases lists PE.2 and PE as done, one line per task, with the plan named', () => {
    expect(arch).toMatch(/- \[x\] \*\*PE\. Streets on the path engine\*\*/)
    expect(arch).toMatch(/- \[x\] PE\.2 /)
    expect(arch.split('\n').filter((l) => /PE\.2 task \d+ landed/.test(l))).toHaveLength(14)
    expect(arch).toContain('docs/superpowers/plans/2026-11-19-phase-pe2-street-lanes.md')
    for (const hash of ['5c03bea', '9bd95ac', '7223b3a', '5ec8394', '298a679', 'f9fd529', '7e71170', '1d23a92', 'a3a2147', '13c9eeb', '668eb5e', 'c75a670', '1ee807e']) expect(arch, hash).toContain(hash)
  })

  it('the older rows say what PE.2 changed, and Layers names the new files', () => {
    for (const name of ['Exterior circulation', 'On edge engine', 'Padlocks by kind', 'Groups of any kind']) {
      const l = arch.split('\n').find((x) => x.includes('| ' + name + ' |')) ?? ''
      expect(l, name).toMatch(/PE\.2/)
    }
    for (const name of ['Path engine', 'Street sides', 'Joins as one', 'Width by hand', 'Kinds', 'Layers', 'DXF export, reference lines and notes']) {
      const l = arch.split('\n').find((x) => x.includes('| ' + name + ' |')) ?? ''
      expect(l, name).toMatch(/PE\.2/)
    }
    const layers = arch.split(/^## /m).find((s) => s.startsWith('Layers')) ?? ''
    for (const name of ['lanes.ts', 'gateGeometry.ts', 'gateSides.ts', 'gateEdges.ts', 'gateSlide.ts', 'gateHosts.ts']) expect(layers, name).toContain(name)
    expect(arch).not.toMatch(/PE\.2 turns lanes on/)
  })

  it('docs/mcp.md has the PE.2 street tools, and docs/tour.md says what the texts say of lanes and gates', () => {
    const mcp = read('docs/mcp.md')
    expect(mcp).toContain('### Streets (Phase PE.2)')
    for (const word of ['setStreetLanes', 'moveExistingRoad', 'rotateExistingRoad', '`on`']) expect(mcp, word).toContain(word)
    const tour = read('docs/tour.md')
    expect(tour).toContain('Phase PE.1 and PE.2')
    for (const word of ['Equal lanes', 'a pill with the lane count', 'any street']) expect(tour, word).toContain(word)
  })
})

describe('docs/tour.md: the anchors it lists are in the app', () => {
  const doc = readFileSync('docs/tour.md', 'utf8')
  const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**'], { query: '?raw', import: 'default', eager: true })
  const code = Object.values(sources).join('\n')
  // the bullets of "Anchors" and "Its anchors" of From zero; a name with < > is a family, left out
  const section = doc.slice(doc.indexOf('## Anchors'), doc.indexOf('## Before presenting again')) + doc.slice(doc.indexOf('- **Its anchors:**'), doc.indexOf('- **Before showing it:**'))
  const names = [...new Set([...section.matchAll(/`([a-z][a-zA-Z0-9-]*)`/g)].map((m) => m[1]))]
  // a name the code writes whole, or one of a family it builds (`menu-${…}`, `tab-${…}`)
  const given = (n: string) => new RegExp(`["'\`]${n}["'\`]|tour="${n}"`).test(code) || (['menu', 'tab'].includes(n.split('-')[0]) && code.includes(`${n.split('-')[0]}-` + '${'))

  it('lists some anchors', () => expect(names.length).toBeGreaterThan(20))
  it('each one is a name the code gives an element', () => {
    // a Tools strip button's anchor is built from its command (`tool-<id without 'tool.'>`, ToolStrip.tsx): it is there when the command is in the strip
    expect(names.filter((n) => !given(n) && !(n.startsWith('tool-') && commandOf(n.replace(/^tool-/, 'tool.'))?.tool))).toEqual([])
  })
  it('lists the anchors of the five tools of Phase AS.5 (Mirror, Array, Align, Reference line, Note), and each is a button of the strip', () => {
    for (const name of ['tool-mirror', 'tool-array', 'tool-align', 'tool-referenceLine', 'tool-note']) {
      expect(names, name).toContain(name)
      expect(commandOf(name.replace(/^tool-/, 'tool.'))?.tool, name).toBeDefined()
    }
  })
})

describe('the Tools strip draws the anchors of the five new tools', { timeout: 30_000 }, () => {
  it('tool-mirror, tool-array, tool-align, tool-referenceLine and tool-note are on screen', async () => {
    useScreen.setState({ home: false })
    useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
    useToast.setState({ toast: null, confirmation: null })
    render(<App />)
    for (const a of ['tool-mirror', 'tool-array', 'tool-align', 'tool-referenceLine', 'tool-note'])
      await waitFor(() => expect(document.querySelector(`[data-tour="${a}"]`), a).not.toBeNull())
  })
})
