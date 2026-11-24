# The tour — how to keep it up to date

The guided tour (Decision *Tour*) runs on the sample project (Decision *Sample project*). The app keeps changing, so
before each presentation check the tour against the app as it is. Everything it says and does is data in one file.

## Where things are

| What | File |
|---|---|
| The steps: chapter, title, text, anchor, what each shows and does | `src/views/tour/steps.ts` |
| The engine: Next / Back / Chapters / Exit | `src/views/tour/tour.ts` |
| The card beside its anchor, the offer when the sample opens | `src/views/tour/TourCard.tsx`, `TourOffer.tsx` |
| The sample project the tour walks through | `src/state/sample.ts` |
| Home, its sample card and *How it works* | `src/views/home/Home.tsx`, `HowItWorks.tsx`, `ProjectsTable.tsx`, `ProjectSummary.tsx` |
| The guards: the steps on the real app; the texts (no word for what is gone, every tab, row and block-card anchor on screen, and every anchor this page lists a name the code gives) | `src/views/tour/__tests__/tour.test.tsx`, `texts.test.tsx` |

## A step

```ts
{
  id: 'slope',                    // unique
  chapter: 'The site',            // steps of a chapter go together; the chapter menu lists them in order
  title: 'How steep is it?',
  body: ['One paragraph.', 'Another.'],
  anchor: 'terrain-show',         // the element with data-tour="terrain-show"; absent: a card in the middle
  before: () => ui().setView('plan'),                        // what the app shows as the step opens
  act: () => useTerrainView.getState().setShow('slope'),     // what Next does when the user has not done it
  done: () => useTerrainView.getState().show === 'slope',    // whether the user did it (Next then says ✓)
}
```

Steps drive the app only through its own verbs (`useUi`, `useApp`, `actions`, a module's view commands). A step with
`act` must have `done`, and `act` must leave `done` true: the guard test checks it.

## Anchors

An anchor is a `data-tour="…"` attribute on the element the card points at. Those in use:

- `home`, `options`, `save` — the top bar
- `menu-file`, `menu-edit`, `menu-view`, `menu-site`, `menu-design`, `menu-tools`, `menu-help` — the menu bar's buttons (a phone has `menu`, its ☰, instead). The
  loose buttons the menus replaced are gone with their anchors: a step about Compare points at `menu-design`, the Tour's at `menu-help`,
  Export's at `menu-file`, and its text says where the command is now ("File › Export › CAD plan (.dxf)")
- `kpis` — the figures strip; `viewport` — the plan / 3D
- `tab-<label>` — every tab of the left panel, by its label in lower case (`tab-layers`, `tab-blocks`, `tab-properties`, and a plugin's: `tab-optimize`, `tab-agent`); `layer-<row id>` — a row of Layers (`layer-circulation`)
- `panel-left`, `panel-right` — the side panels; `dialog-<label>` — the windows (`dialog-brief`, `dialog-rules`, `dialog-program`)
- `terrain-show` — the terrain view menu; `home-sample` — Home's sample card (the bottom strip)
- `optimizer-on` — the optimizer's *Turn on for this project* (its tab; the tour clicks it when the user has not)

Moving or renaming one of these elements keeps its anchor as long as the attribute moves with it.

## Before presenting again

1. `npx vitest run src/views/tour src/views/home src/state/__tests__/sample.test.ts` — the guard walks every step on
   the real app and fails when an anchor is gone or a step no longer does what it says.
2. Take the tour by hand once (`npm run dev`, Home → ▶ Take the tour), pressing only Next, then once trying each step:
   read every card against what the app shows now.
3. New features worth showing get a step (or a chapter) in `steps.ts`; their element gets a `data-tour`.
4. If the sample changes (`state/sample.ts`), update the facts the steps quote (the yard's 44.7 m, the options' names).
5. In a clean browser profile, open the public link: Home, the sample and the offer are what a first visitor sees.

## From zero — the second tutorial

From zero (Decision *From zero tutorial*; spec `docs/superpowers/specs/2026-11-10-from-zero-tutorial-design.md`) builds
"My first project" from an empty Home to a CAD plan, in eight chapters. Same engine and card (`tour.ts`,
`TourCard.tsx`), its own steps and rules:

| What | File |
|---|---|
| Its steps, one file a chapter (project, site, block, onSite, moving, flow, earthwork) | `src/views/tour/zero/` (`index.ts` lists them in order) |
| Starting it, resuming, a chapter on its own (replays every earlier step's `act` on a fresh project) | `src/views/tour/zero/run.ts` |
| The tutorial's site file, and the script that writes it (`node scripts/tutorial-site.mjs`) | `public/tutorial/site.dxf`, `scripts/tutorial-site.mjs` |
| What the chapters share: the tutorial block, its copies | `src/views/tour/zero/common.ts` |
| Its guards: one per chapter, and the whole run | `src/views/tour/__tests__/zero*.test.tsx` |

- **The person does it.** A step with `done` waits: Next only once `done()` is true; *Do it for me* runs `act`, then
  goes on. A step may have `why` (folded under its text) and `action` (a button of its own, as chapter 2's *Use the
  tutorial’s site file*). `done` is read several times a second: keep it cheap (memoize what is costly, as chapter 6's
  Connect check).
- **A chapter on its own** is the steps before it replayed (`before`, then `act` when not `done`): so every `act` must
  work on the project its earlier steps leave, and a step's `before` must open what its anchor needs.
- **Starts:** Home's sidebar *Learn GFit from zero* (`home-zero`, in place of the sample's *Guided tour*, which stays on the sample's card) and Help › *Learn GFit from zero*. Started again, it
  resumes on My first project where it was left (`gfit.tutorial.at`); a chapter picked from the card's Chapters asks
  before replacing what the project has.
- **What the texts say of the menus and the cards** (Phase AS.4, Decisions *One menu*, *Blocks are picked*): a block card is picked by a click and
  placed by a drag or by *Place* in its right-click menu (the sample tour's *The block editor* and From zero's `zero-place` say so; `zero-place`'s `act` still
  calls `placeCopy`). Dock, Door, Pattern and Court are the Elements group of the Tools strip, not chips of Blocks (`site-tools`, their anchor, is gone), and
  no text names a plan, a tree or a program menu: the app has one right-click menu. `texts.test.tsx` fails on the old words.
- **What the texts say of the snap, the groups and the General tools** (Phase AS.5, Decisions *Mirror, Array, Align*, *Groups of any kind*, *Reference lines*): Snap ▾'s
  entries are *Drawing lines* (the site's imported drawings), *Reference lines* (the guides drawn on the plan) and *Contours*; a group is of any kind, not of masses
  only; the General group is Select, Move, Copy, Rotate, Mirror, Array, Align and Group, and *Align* there is the tool (the drafting bar's *Align* is the snap's switch).
  The tours have no step for the five new tools (not in AS.5): when one is added, its anchor is `tool-mirror`, `tool-array`, `tool-align`, `tool-referenceLine` or `tool-note`.
- **What the texts say of the shape tools and the typed number** (Phase D.1, Decisions *Shape engine*, *Chamfer*, *Typed dimension*): a picked block has a pill on each wall and a dot on each corner; the number of a drag shows **beside the handle**, and digits typed during the drag or right after it, with Enter, make it exact (one undo step); the command line mirrors it and still takes the tools' numbers (Rotate, Move, Copy). The Massing group is Draw, Hole, Corner, **Chamfer** (`Shift+F`) and Union. The sample tour's `shape` step points at `tool-chamfer`; From zero's Rotate and court steps say where the number is typed. `texts.test.tsx` fails on a text that says a wall's, a court's or a corner's number is typed only in the command line.
- **What the texts say of Draw and a block's outline** (Phase D.2, Decisions *Outline in metres*, *Clipped grid*, *Draw makes a block*): there are no free masses, Draw makes a block (its ▾ picks the program, the stroke is the block's outer face, its walls inside it, on its type's grid), a block's outline is free (any angle, chamfers, curves, holes) with the **module lines a snap and Shift free**, and docks, doors, patterns and truck courts go only on walls along the grid. No text says a wall moves "by whole modules" (only the optimizer's box does), names a "Mass tool" or a mass drawn, or puts a block's outline "on the module lines"; the sample tour's `shape` step says a placed block's outline is free and the grid cut by it, and the *Inside a block* step names the shape step as free with a snap. `texts.test.tsx` fails on the old words and reads the Decisions of D.2.
- **What the texts say of courts and docks** (Phase D.3, Decisions *Court shape*, *On edge engine*, *Split*): a truck court is a shape of its own (click it to pull its sides and far edge, chamfer its corners, or cut it with Split, key `S`, beside Chamfer; for now Split takes only a truck court, and cuts the courts its drawn line touches); docks, doors and patterns are put, slid, counted and widened the same way in the block editor and on the site: Select picks them on the site too, the pills at the ends of what is picked add or take modules, the pill at its side sets the width, and a typed number is exact. The old court pill stays on a plain (non-block) mass. Key `S` is Split in the project; Rotate 90° stays Shift+R. The sample tour's `shape` step and From zero's court step name the shape handles and Split.
- **What the texts say of streets, lanes and gates** (Phase PE.1 and PE.2, Decisions *Width by hand*, *Lanes*, *Gates on any street*, *Existing streets transformed*): a street is drawn by its centreline and its type gives only a new street's width; each side is pulled by its own pill (Shift the whole street, Ctrl without the 0.5 m step, a typed number for the exact width), and a pill with the lane count adds or takes a lane, each lane line is dragged or typed, and *Equal lanes* is in the right-click menu (the sample tour's `streets` step, From zero's `zero-street`). No street is special: a gate goes on the boundary or on either side of any street, drawn or existing, and slides along that side (From zero's `zero-gate`); an existing street is picked on the plan and moved, turned, mirrored, copied, locked and grouped like a block (`zero-move` lists it). `texts.test.tsx` fails on a text that says a gate stands only on the boundary or uses the old word for the street the site faces.
- **Its anchors:** `create-new`, `create-project`, `create-industrial`, `create-no-terrain`, `create-start` (Home and
  Create new); `import`, `survey-units`, `survey-layers`, `survey-boundary`, `survey-import` (the survey window);
  `new-block`, `block-step-<step>`, `block-lock`, `dialog-close`, `block-card`, `back-to-type` (blocks);
  `tool-<tool>` (Select, Move, Copy, Rotate, Street, Gate, Connect, Lot, and the Elements group's Dock, Door, Pattern, Court; since Phase AS.5 also `tool-mirror`, `tool-array`, `tool-align`, `tool-referenceLine` and `tool-note`: the strip builds each anchor from its command, `tool.<id>`, and no step points at the five yet; since Phase D.1 also `tool-chamfer`, the sample tour's `shape` step), `snap`, `ruler`; `layer-<row id>` (a row of Layers) and `tab-<label>` (the
  left panel's tabs); `platform`, `summary-<tab>`, `detail`, `menu-view`, `menu-file` (Export's step); `home-zero`.
- **Before showing it:** `npx vitest run --dir src src/views/tour`, then take it once by hand and once by *Do it for
  me* (`npm run dev`, Home → *Learn GFit from zero*). If the site file changes, run the script again and check the
  guesses its guard pins (`zeroSite.test.tsx`).
