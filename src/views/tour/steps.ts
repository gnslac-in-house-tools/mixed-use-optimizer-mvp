// The tour's steps (Decision "Tour"), over the sample project (state/sample.ts). Each points at a `data-tour` anchor,
// sets what the app shows (`before`) and, when it asks for something, does it if the user did not (`act`, `done`).
// The app changes, so this file does too: docs/tour.md says how; tour.test.ts fails when an anchor is gone or a step
// no longer runs on the sample.
import { isSoon, usePluginModes } from '../../plugins/index.ts'
import { useTerrainView } from '../../modules/terrain/views/terrainView.ts'
import { openType } from '../../modules/warehouse/views/commands.ts'
import type { Id } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { keyHint, titleWith } from '../commands/shortcuts.ts'
import { useCompare } from '../compare/compareView.ts'
import { useUi } from '../layout/ui.ts'
import { showToolsFor } from './anchors.ts'
import type { TourStep } from './tour.ts'

/**
 * How many ways to model the tour shows: by hand always, the optimizer and the agent unless held back (Decision "Coming
 * soon"). The chapter's name and its numbering read right whichever are left out.
 */
const ways = () => {
  const { soon } = usePluginModes.getState()
  return 1 + (isSoon(soon, 'optimizer') ? 0 : 1) + (isSoon(soon, 'agent') ? 0 : 1)
}
const waysChapter = () => ['Modeling by hand', 'Two ways to model', 'Three ways to model'][ways() - 1]

const app = () => useApp.getState()
const ui = () => useUi.getState()

/** The sample's option whose name starts with this letter (A, B, C). */
const option = (letter: string): Id | undefined => app().project.options.find((o) => o.name.startsWith(`${letter} ·`))?.id
const toOption = (letter: string) => {
  const id = option(letter)
  if (id && app().option !== id) app().setOption(id)
}
const typeId = (name: string): Id | undefined => app().project.warehouseTypes?.find((t) => t.name === name)?.id
/** The first mass of a program in the option in view. */
const massOf = (programId: Id): Id | undefined => {
  const p = app().project
  const o = p.options.find((x) => x.id === app().option)
  const levels = new Set(p.buildings.filter((b) => o?.buildingIds.includes(b.id)).flatMap((b) => b.levels.map((l) => l.id)))
  return p.masses.find((m) => m.programId === programId && levels.has(m.levelId))?.id
}
/** The hall of the copy of `type` that is a variant (its hall changed), in the option in view. */
const variantHall = (type: string): Id | undefined => {
  const p = app().project
  const o = p.options.find((x) => x.id === app().option)
  const b = p.buildings.find((x) => o?.buildingIds.includes(x.id) && x.warehouse?.type === typeId(type) && x.warehouse?.overrides?.hall)
  return b && p.masses.find((m) => m.part === 'hall' && b.levels.some((l) => l.id === m.levelId))?.id
}
/** Whether the optimizer is on for this project (its own data says so; the core only reads it). */
const optimizerOn = () => (app().project.plugins?.optimizer as { on?: boolean } | undefined)?.on === true
/** Clicks a control as soon as it shows (a plugin's tab loads a moment after it opens), for up to two seconds. */
function clickWhenShown(selector: string, tries = 20): void {
  const el = document.querySelector<HTMLElement>(selector)
  if (el) el.click()
  else if (tries > 0) setTimeout(() => clickWhenShown(selector, tries - 1), 100)
}
// the relation's message names the two masses first (the yard's block: "Yard · Hall and Cross-dock 3 · Hall: Outdoor storage within 40 m…")
const yardIssue = () => app().derived.issues.some((i) => i.code === 'relation' && i.message.includes(': Outdoor storage '))
const quiet = () => {
  ui().closeDialog()
  useCompare.getState().close()
}

export const STEPS: TourStep[] = showToolsFor([
  // 1 · Welcome
  {
    id: 'welcome',
    chapter: 'Welcome',
    title: 'Welcome to GFit',
    body: [
      'GFit is a test fit on real sites: buildings, their docks, roads, parking and earthwork, measured as you design.',
      'This is the sample project: an industrial park on a sloping site, with two smart blocks and three design options.',
      'Press Next to go on — when a step asks for something, Next does it for you; or try it yourself first. Chapters skips ahead; Exit leaves at any time.',
    ],
    before: () => {
      quiet()
      toOption('A')
      ui().setRail('layers')
      ui().setView('plan')
    },
  },
  {
    id: 'three-ways',
    needs: 'optimizer',
    chapter: 'Welcome',
    title: 'Three ways to model',
    body: [
      'By hand: drag, stretch and rotate buildings; their docks, truck courts and platforms follow. The streets come after, drawn or connected.',
      'With the optimizer: say what may change and what to aim for; it searches options that keep every rule.',
      'With an agent: ask in words and it runs the same tools. The agent is not available in this demo.',
    ],
    anchor: 'tab-optimize',
  },
  {
    id: 'home',
    chapter: 'Welcome',
    title: 'Home and your projects',
    body: ['GFit takes you Home: every project kept in this browser, the sample and this tour; Create new starts a project or a block, and Blocks and Terrain are libraries for the whole team. Projects stay in this browser; File › Export › Project (.gft) takes one away, and Load project brings it back.'],
    anchor: 'home',
  },

  // 2 · The site
  {
    id: 'site',
    chapter: 'The site',
    title: 'A real site, with its ground',
    body: [
      'About 16.5 ha whose ground rises some 25 m to the north, with a ridge and a hollow. A site comes from a DXF: its boundary, contours or spot heights, existing roads.',
      'The 3D shows the surface; each building sits on a platform cut and filled into it.',
    ],
    anchor: 'viewport',
    before: () => {
      quiet()
      ui().setRail('layers')
      ui().setView('3d')
      useTerrainView.getState().setShow('contours')
      // the ground's heights three times: a 25 m fall over 300 m reads as flat otherwise
      useTerrainView.getState().setExaggeration(3)
    },
  },
  {
    id: 'slope',
    chapter: 'The site',
    title: 'How steep is it?',
    body: ['Show the ground by its slope: flat greens build as they are, oranges and reds need platforms and banks. Pick Slope in the Terrain menu.'],
    anchor: 'terrain-show',
    before: () => {
      ui().setView('plan')
      useTerrainView.getState().setExaggeration(1)
    },
    act: () => useTerrainView.getState().setShow('slope'),
    done: () => useTerrainView.getState().show === 'slope',
  },
  {
    id: 'earthwork',
    chapter: 'The site',
    title: 'Cut and fill, measured',
    body: ['Cut & fill shows each platform’s earthwork by depth. The figures strip counts it — cut, fill, balance, the steepest road — for the option in view, as everything else.'],
    anchor: 'kpis',
    act: () => useTerrainView.getState().setShow('earthwork'),
    done: () => useTerrainView.getState().show === 'earthwork',
  },

  // 3 · Brief and rules
  {
    id: 'brief',
    chapter: 'Brief and rules',
    title: 'What the client asks',
    body: ['The Brief: each program (cross-dock, rear-load, office, guard house, yard) with its area and count. Every option is measured against it.'],
    anchor: 'dialog-brief',
    before: () => {
      quiet()
      ui().setRail('layers')
      ui().openDialog('brief')
    },
  },
  {
    id: 'rules',
    chapter: 'Brief and rules',
    title: 'Rules between programs',
    // a getter: the optimizer's line is there only while it is not held back (Decision "Coming soon")
    get body() {
      return [
        'Rules are sentences: the office is adjacent to the warehouse, the yard within 40 m of it, the guard house 30 m apart. A broken rule shows as an issue, with its reason.',
        ...(isSoon(usePluginModes.getState().soon, 'optimizer') ? [] : ['The optimizer reads the same rules.']),
      ]
    },
    anchor: 'dialog-rules',
    before: () => ui().openDialog('rules'),
  },

  // 4 · Smart blocks
  {
    id: 'blocks',
    chapter: 'Smart blocks',
    title: 'The block editor',
    body: [
      'A smart block is a typical building designed once: a warehouse type, or any program. Its copies on the site keep its rules.',
      'This project has two: a cross-dock and a rear-load warehouse. Drag a card onto the plan or the 3D to place a copy, or right-click it and choose Place.',
    ],
    anchor: 'panel-left',
    before: () => {
      quiet()
      toOption('A')
      ui().setView('plan')
      ui().setRail('blocks')
      useTerrainView.getState().setShow('contours')
    },
  },
  {
    id: 'block-open',
    chapter: 'Smart blocks',
    title: 'Inside a block: six steps',
    body: [
      'A block is one mass, made in six steps, in any order, each locked once checked: ① the grid (bays and modules) ② the hall, its box and range ③ columns ④ the envelope ⑤ shape — its outline, free (any angle, a chamfer, a curve, holes) with the module lines a snap, and its zones, like this office ⑥ elements — docks and doors, one on each module of an edge, kept from its nearer wall.',
      'Change any step at any time: every copy on the site is remade, and the later locked steps ask to be checked again.',
    ],
    anchor: 'dialog-program',
    before: () => {
      const id = typeId('Cross-dock')
      if (id) openType(id)
    },
  },
  {
    id: 'variant',
    chapter: 'Smart blocks',
    title: 'A copy that is a variant',
    body: [
      'Option A has two cross-docks; the second is two bays shorter. A pill on every wall moves it, the module lines a snap and Shift free: the box’s (blue) never past the block’s range, dashed while dragged; an inner one (ink) on its own, this copy’s.',
      'Its Properties say what it changes, and Back to type undoes it. Grid, columns and envelope always stay the block’s.',
    ],
    anchor: 'panel-left',
    before: () => {
      quiet()
      toOption('A')
      ui().setRail('properties')
      const id = variantHall('Cross-dock')
      if (id) app().select(id)
    },
  },

  // 5 · Options
  {
    id: 'options',
    chapter: 'Options',
    title: 'Several answers, one project',
    body: ['A: two cross-docks. B: three rear-loads. C: one of each, with the yard and the guard house. Switch here: the figures, issues and views follow the option in view.'],
    anchor: 'options',
    before: quiet,
    act: () => toOption('B'),
    done: () => app().option !== option('A'),
  },
  {
    id: 'compare',
    chapter: 'Options',
    title: 'Compare them side by side',
    body: ['Design › Options › Compare… puts the options next to each other, plans at the same scale and their figures in one table.'],
    anchor: 'menu-design',
    act: () => useCompare.getState().start(app().project.options.map((o) => o.id)),
    done: () => useCompare.getState().open,
  },

  // 6 · Three ways to model
  {
    id: 'by-hand',
    get chapter() {
      return waysChapter()
    },
    get title() {
      return ways() > 1 ? '1 · By hand' : 'By hand'
    },
    body: [
      'In option C the yard is 44.7 m from the cross-dock; the rule asks for 40. Drag the yard (selected) a few metres west and watch the issue clear — the platforms and the earthwork follow every move.',
    ],
    anchor: 'viewport',
    before: () => {
      quiet()
      toOption('C')
      ui().setRail('properties')
      ui().setView('plan')
      const yard = massOf('outdoor-storage')
      if (yard) app().select(yard)
    },
    act: () => {
      const yard = massOf('outdoor-storage')
      if (yard && yardIssue()) app().apply((p) => actions.moveMasses(p, [yard], { x: -8, y: 0 }))
    },
    done: () => !yardIssue(),
  },
  {
    id: 'shape',
    get chapter() {
      return waysChapter()
    },
    title: 'Walls, corners and chamfers',
    get body() {
      return [
        'A picked block has a pill on each wall and a dot on each corner: drag a pill to push or pull the wall, a dot to move the corner, Alt and double-click a wall to add a corner. The module lines are a snap, and Shift moves it free. The number shows beside the handle: type digits during the drag or right after it and press Enter for the exact value, one undo step. Holes work the same, and a placed block’s outline is free: the grid is cut by it, and docks stay on the walls along the grid.',
        `In the Massing group of the Tools strip, Corner (${keyHint('tool.corner')}) rounds a corner and ${titleWith('Chamfer', 'tool.chamfer')} cuts it: click a corner, then move the pointer or type the set-back. A chamfer’s two ends then slide along its walls, each beside its own number. A truck court is a shape too: click it to pull its sides and far edge, chamfer its corners, or cut it with ${titleWith('Split', 'tool.split')}, two clicks across it.`,
      ]
    },
    anchor: 'tool-chamfer',
    before: () => {
      quiet()
      toOption('C')
      ui().setRail('properties')
      ui().setView('plan')
      const yard = massOf('outdoor-storage')
      if (yard) app().select(yard)
    },
  },
  {
    id: 'streets',
    get chapter() {
      return waysChapter()
    },
    title: 'Buildings first, then the streets',
    body: [
      'In the Streets group of the Tools strip, Street draws them node by node, and Connect draws in one click the shortest way from a truck gate to every court that has none — the sample’s were drawn so. Then edit them by hand: a pill on each side of a street pulls that side (Shift the whole street, Ctrl without the 0.5 m step, a typed number for the exact width), a pill with the lane count adds or takes a lane and each lane line is dragged or typed (Equal lanes, in the right-click menu), streets that meet are one paving, and nothing blocks: a warning says what does not work.',
      'Each warehouse brings its truck court; between two that face each other, the dimension is typed to move the one picked.',
      'A gate goes on the boundary or on either side of any street, and slides along that side. An existing street is picked on the plan, moved, turned and locked like a block, and the streets and gates that follow it go with it.',
    ],
    anchor: 'tool-street',
    before: () => {
      quiet()
      toOption('A')
      ui().setView('plan')
      ui().setRail('layers')
    },
  },
  {
    id: 'optimizer',
    needs: 'optimizer',
    get chapter() {
      return waysChapter()
    },
    title: '2 · With the optimizer',
    body: [
      'Optimize opens its stages — turn it on for this project the first time: what may change, what to aim for (the brief, earthwork, distances) and what must hold.',
      'With smart blocks it varies each copy within its block’s rules: its box’s length and width by whole modules (its inner walls keep their distance from the nearer wall).',
    ],
    anchor: 'tab-optimize',
    act: () => {
      ui().setRail('plugin:optimizer/stages')
      ui().setSummaryTab('plugin:optimizer/specimens')
      if (!optimizerOn()) clickWhenShown('[data-tour="optimizer-on"] button')
    },
    done: () => ui().rail === 'plugin:optimizer/stages' && optimizerOn(),
  },
  {
    id: 'optimizer-run',
    needs: 'optimizer',
    get chapter() {
      return waysChapter()
    },
    title: 'Run, then keep what you like',
    body: [
      'Press ▶ Run on a stage: the specimens appear on the right as they are found, the best on their front.',
      'Pick one to preview it on the plan; Keep makes it a new option beside A, B and C.',
    ],
    anchor: 'panel-right',
  },
  {
    id: 'agent',
    needs: 'agent',
    get chapter() {
      return waysChapter()
    },
    // the agent follows the optimizer unless that one is held back
    get title() {
      return `${isSoon(usePluginModes.getState().soon, 'optimizer') ? 2 : 3} · With an agent`
    },
    body: ['An agent takes requests in words — “try the rear-loads facing north” — and runs the same tools, one undo step each. The agent is not available in this demo.'],
    anchor: 'tab-agent',
  },

  // 7 · Take it with you
  {
    id: 'save',
    chapter: 'Take it with you',
    title: 'Saved as you go',
    // the key is Save's as the registry has it now (read when the card shows, so a key the user gave shows too)
    get body() {
      const key = keyHint('file.save')
      return [`Every change is kept in this browser a moment later, and this says when. ${key ? `${key} keeps it` : 'Save keeps it'} at once and confirms it. For another computer, File › Export › Project (.gft) is the file; Load project opens it from Home.`]
    },
    anchor: 'save',
    before: quiet,
  },
  {
    id: 'end',
    chapter: 'Take it with you',
    title: 'Your turn',
    body: [
      'Change anything here: the sample is yours, and Home can reset it. Start your own project from Home’s Create new — on one of Terrain’s sites, or none — and it opens with no tour.',
      'Help › Sample tour, in the top menu, brings this back.',
    ],
    anchor: 'menu-help',
  },
])
