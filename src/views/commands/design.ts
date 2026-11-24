// The Design menu's commands (Project C, AS.1): Options ▸ (one ticked row per option to go to it, then New, Duplicate,
// Rename…, Delete, Compare…: the option switch's menu), Brief…, Rules… (the windows the Brief tiles open), Levels…
// (the Properties of the building the plan is on: its levels), New building (the Buildings row's ＋ in Layers; the masses selected go to a new building from the plan's right-click, *To a new building*) and Solve all. Each `run` calls what the control it stands for calls (`buildingCommands.ts`'s
// option verbs, `openDialog`, `solveOption`); Rename… asks the option switch to open on its name field
// (`layout/optionRename.ts`), the only place that field lives. The options' list is a function the registry calls when
// the menu opens, so it follows the project. Solve all is greyed as the Issues tab's button is: with no issue Solve can
// settle. A plugin adds its own items when it is back (Design › Optimize…): none yet, the plugins are held back.
import { useApp } from '../../state/store.ts'
import { useCompare } from '../compare/compareView.ts'
import { solveOption } from '../graph/GraphTools.tsx'
import { useOptionRename } from '../layout/optionRename.ts'
import { useUi } from '../layout/ui.ts'
import { compareOptions, duplicateActiveOption, goToOption, newBuilding, newOption, removeOption } from '../panels/buildingCommands.ts'
import { solveAllRefusal } from '../stats/issueCommands.ts'
import { showLevelsOfBuilding } from '../layers/show.ts'
import { register, registerList } from './registry.ts'
import type { Command } from './types.ts'

const OPTIONS = ['Design', 'Options']
const optionCount = () => useApp.getState().project.options.length

/** One row per option of the project, the active one ticked: going to it. */
const optionRows = (): Command[] =>
  useApp.getState().project.options.map((o) => ({
    // `go` apart: an option called "new" or "delete" must not take the id of a verb below
    id: `design.option.go.${o.id}`,
    label: o.name,
    menu: OPTIONS,
    run: () => goToOption(o.id),
    checked: () => useApp.getState().option === o.id,
  }))

const OPTION_COMMANDS: Command[] = [
  { id: 'design.option.new', label: 'New', menu: OPTIONS, separatorBefore: true, run: newOption },
  { id: 'design.option.duplicate', label: 'Duplicate', menu: OPTIONS, run: () => duplicateActiveOption() },
  { id: 'design.option.rename', label: 'Rename…', menu: OPTIONS, run: () => useOptionRename.getState().ask() },
  {
    id: 'design.option.delete',
    label: 'Delete',
    menu: OPTIONS,
    run: () => removeOption(useApp.getState().option),
    enabled: () => (optionCount() <= 1 ? 'The only option' : true),
  },
  {
    id: 'design.option.compare',
    label: 'Compare…',
    menu: OPTIONS,
    // the option switch's row and Compare's On / Off: every option side by side, or back to the viewport
    run: () => (useCompare.getState().open ? useCompare.getState().close() : compareOptions()),
    enabled: () => (optionCount() < 2 ? 'Make a second option to compare' : true),
    checked: () => useCompare.getState().open,
  },
]

export const DESIGN_COMMANDS: Command[] = [
  { id: 'design.brief', label: 'Brief…', menu: ['Design'], separatorBefore: true, run: () => useUi.getState().openDialog('brief') },
  { id: 'design.rules', label: 'Rules…', menu: ['Design'], run: () => useUi.getState().openDialog('rules') },
  // mixed-use-mvp (calificación): the residential module's rules window; greyed without the module's data
  {
    id: 'design.calificacion',
    label: 'Reglas de calificación…',
    menu: ['Design'],
    run: () => useUi.getState().openDialog('calificacion'),
    enabled: () => (useApp.getState().project.residential ? true : 'Only with the Uso mixto typology'),
  },
  { id: 'design.levels', label: 'Levels…', menu: ['Design'], run: showLevelsOfBuilding },
  // a building of the option in view, with one level (the Buildings row of Layers has the same ＋)
  { id: 'design.building.new', label: 'New building', menu: ['Design'], run: () => newBuilding() },
  { id: 'design.solve', label: 'Solve all', menu: ['Design'], key: 'Ctrl+Enter', separatorBefore: true, run: solveOption, enabled: solveAllRefusal },
]

export function registerDesign(): void {
  registerList(OPTIONS, optionRows)
  register(OPTION_COMMANDS)
  register(DESIGN_COMMANDS)
}
