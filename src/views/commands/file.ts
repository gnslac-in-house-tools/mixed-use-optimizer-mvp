// The File menu's commands (Project C, AS.1): New … project (one per typology, as the old top bar's ⋯ listed them), Load
// project…, Save, Export ▸ (the five rows of the Export menu, the CAD plan's 3D box a tick of its own), Project data…,
// Autosave, Open the demo project, Home. Each `run` calls the function the control it stands for calls (files.ts,
// saving.ts, exporting.ts…): the definition here is a label, a key, where it answers and when it is enabled, never a
// second body. Keys (spec "Shortcuts"): Load Ctrl+O, Save Ctrl+S and Ctrl+Shift+S, Export project Ctrl+E, CAD plan Ctrl+Shift+E.
// Save and Load answer while typing and in any window (they always did); on Home Load works and Save is disabled with
// "Open a project first", so Ctrl+S is prevented there (no browser Save page) and says why.
import { TYPOLOGIES } from '../../typologies/index.ts'
import { exportGft, goHome, loadProject, openDemo, startProject } from '../layout/files.ts'
import { EXPORT_LABELS, IMAGE_OFF, LOG_OFF, exportDxfAsSet, exportImageNow, exportLogCsv, loggedCount, useCadPlan } from '../layout/exporting.ts'
import { openModelExport } from '../layout/ModelExportDialog.tsx'
import { openProjectData } from '../layout/ProjectDialog.tsx'
import { save, toggleAutosave, useSaving } from '../layout/saving.ts'
import { useScreen } from '../home/screen.ts'
import { useSceneRef } from '../scene/sceneRef.ts'
import { register, registerList } from './registry.ts'
import type { Command } from './types.ts'

/** One *New … project* per typology (the blank one included): the list depends on what the app offers. */
const newProjects = (): Command[] =>
  TYPOLOGIES.map((t) => ({
    id: `file.new.${t.id}`,
    label: `New ${t.name.toLowerCase()} project`,
    menu: ['File'],
    where: ['project', 'home'],
    run: () => startProject(t.id),
  }))

const EXPORT = ['File', 'Export']

export const FILE_COMMANDS: Command[] = [
  { id: 'file.load', label: 'Load project…', menu: ['File'], key: 'Ctrl+O', where: ['project', 'home', 'rules', 'block-editor', 'dialog'], typing: true, separatorBefore: true, run: () => void loadProject() },
  { id: 'file.save', label: 'Save', menu: ['File'], key: ['Ctrl+S', 'Ctrl+Shift+S'], where: ['project', 'home', 'rules', 'block-editor', 'dialog'], typing: true, run: () => void save(), enabled: () => (useScreen.getState().home ? 'Open a project first' : true) },
  { id: 'file.export.project', label: EXPORT_LABELS.gft, menu: EXPORT, key: 'Ctrl+E', run: () => void exportGft() },
  { id: 'file.export.model', label: EXPORT_LABELS.model, menu: EXPORT, run: openModelExport },
  { id: 'file.export.cad', label: EXPORT_LABELS.dxf, menu: EXPORT, key: 'Ctrl+Shift+E', run: exportDxfAsSet },
  {
    id: 'file.export.cad3d',
    label: '3D box in the CAD plan',
    menu: EXPORT,
    run: () => useCadPlan.getState().set(!useCadPlan.getState().threeD),
    checked: () => useCadPlan.getState().threeD,
  },
  { id: 'file.export.image', label: EXPORT_LABELS.png, menu: EXPORT, run: exportImageNow, enabled: () => (useSceneRef.getState().capturePng ? true : IMAGE_OFF) },
  { id: 'file.export.log', label: EXPORT_LABELS.log, menu: EXPORT, run: exportLogCsv, enabled: () => (loggedCount() > 0 ? true : LOG_OFF) },
  { id: 'file.data', label: 'Project data…', menu: ['File'], separatorBefore: true, run: openProjectData },
  { id: 'file.autosave', label: 'Autosave', menu: ['File'], run: toggleAutosave, checked: () => useSaving.getState().autosave },
  { id: 'file.demo', label: 'Open the demo project', menu: ['File'], run: openDemo },
  { id: 'file.home', label: 'Home', menu: ['File'], separatorBefore: true, run: goHome },
]

/** The File menu: the typologies' New first, then the rest in the menu's order. */
export function registerFile(): void {
  registerList(['File'], newProjects)
  register(FILE_COMMANDS)
}
