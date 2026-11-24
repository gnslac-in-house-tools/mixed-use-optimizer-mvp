// What File › Export makes (Phase Q.8, Decisions "Areas rail", "Model export", "DXF export", "Decision log"; Project C, AS.1 moved
// the top bar's Export button and its menu into the File menu): the project file (.gft; files.ts `exportGft`), the 3D model
// (ModelExportDialog.tsx: Rhino, IFC or Speckle), the CAD plan (.dxf, with its 3D box), an image of the 3D view, the decision
// log (.csv). Port of Plaza-Practiko `vistas/paneles/MenuExportar.tsx`. The rows' work and names are functions and constants
// here (`exportDxfAsSet`, `exportImageNow`, `EXPORT_LABELS`…): File › Export's commands (commands/file.ts) call them, and the
// decision log's tab. What later phases export (PDF plans, slides, the live viewer link, the dataset) is not shown until it
// works (Decision "Only what works is shown").
import { create } from 'zustand'
import { dxfBytes, dxfFileName, dxfOf } from '../../io/exportDxf.ts'
import { planOf } from '../../io/exportPlan.ts'
import { fileName } from '../../io/gft.ts'
import { logCsv } from '../../io/logCsv.ts'
import { useApp } from '../../state/store.ts'
import { useSceneRef } from '../scene/sceneRef.ts'
import { download } from './browserIo.ts'

/** The 3D view as it is now, as a PNG. */
export async function exportImage(capture: () => string): Promise<void> {
  const blob = await (await fetch(capture())).blob()
  download(blob, fileName(useApp.getState().project.name, 'png'))
}

/** The decision log as a spreadsheet (Decision "Decision log"): one row per entry, oldest first. */
export function exportLogCsv(): void {
  const { project } = useApp.getState()
  download(new Blob([logCsv(project)], { type: 'text/csv;charset=utf-8' }), fileName(`${project.name} decision log`, 'csv'))
}

/** The CAD plan's 3D box: session-only, off by default (Decision "DXF export"). */
export const useCadPlan = create<{ threeD: boolean; set(on: boolean): void }>((set) => ({ threeD: false, set: (threeD) => set({ threeD }) }))

/** The plan as a DXF (Decisions "DXF export", "DXF interior and paving"): a 2D plan, cut at the floor, or 3D when
 *  asked. Windows-1252 bytes, so an Ñ reaches AutoCAD whole (Decision "DXF writer"). */
export function exportDxf(threeD: boolean): void {
  const { project, derived } = useApp.getState()
  download(new Blob([dxfBytes(dxfOf(planOf(project, derived, { threeD }))) as Uint8Array<ArrayBuffer>], { type: 'application/dxf' }), dxfFileName(project.name, threeD))
}

/** The rows' names: the menu's, and the commands' (File › Export; commands/file.ts). */
export const EXPORT_LABELS = {
  gft: 'Project (.gft)',
  model: '3D model…',
  dxf: 'CAD plan (.dxf)',
  png: 'Image of the 3D view (.png)',
  log: 'Decision log (.csv)',
} as const

/** Why the image is off, and the log: said in the row's detail, and as the commands' reasons. */
export const IMAGE_OFF = 'Open the 3D or Split view first'
export const LOG_OFF = 'No changes logged yet'

/** The CAD plan, with the 3D box as it is now: the row when it is picked, also from the phone's ⋯ (which shows no box). */
export const exportDxfAsSet = (): void => exportDxf(useCadPlan.getState().threeD)

/** The image of the 3D view the mounted scene gives now; nothing while no scene is mounted. */
export function exportImageNow(): void {
  const capture = useSceneRef.getState().capturePng
  if (capture) void exportImage(capture)
}

/** How many entries the decision log has. */
export const loggedCount = (): number => useApp.getState().project.log?.length ?? 0
