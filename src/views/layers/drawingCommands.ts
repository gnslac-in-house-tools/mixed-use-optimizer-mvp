// What a drawing's rows do in Layers (the verbs the old Drawing layers section called, in one place): bring another drawing,
// separate or join a file's layers, remove a file, and the padlocks of a layer, of a file's parcels and of a whole file or
// of all the drawings. Each is one undo step through `actions`; shown or hidden is the layer store's (no step, no verb here).
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { pickSiteFile } from '../plan/site/importState.ts'

/** What *Add drawing…* takes: a drawing, for its layers. */
export const DRAWING_ACCEPT = '.dxf,.dwg'

/** *Add drawing…*: the survey window bringing references alone (a DXF or a DWG of the same site). */
export const addDrawing = (): void => pickSiteFile(DRAWING_ACCEPT, true)

/** Separate a file's layers (each is picked, locked and moved on its own), or join them (one piece). */
export function setSplit(file: string, split: boolean): void {
  useApp.getState().apply((p) => actions.setDrawingSplit(p, file, split))
}

/** Take a file's layers out of the site, and the parcels it brought. */
export function removeDrawing(file: string): void {
  useApp.getState().apply((p) => actions.removeSiteDrawing(p, file))
}

/** One layer's padlock. */
export function setLayerLocked(file: string, layer: string, locked: boolean): void {
  useApp.getState().apply((p) => actions.setDrawingLayerLocked(p, file, layer, locked))
}

/** A file's parcels' padlock, all of them. */
export function setParcelsOfLocked(file: string, locked: boolean): void {
  useApp.getState().apply((p) => actions.setParcelsLocked(p, file, locked))
}

/** The padlock of whole files: every layer and every parcel of each, in one undo step. */
export function setFilesLocked(files: string[], locked: boolean): void {
  useApp.getState().apply((p) =>
    files.reduce((q, file) => {
      const layers = q.site.drawings?.find((d) => d.file === file)?.layers ?? []
      const withLayers = layers.reduce((r, l) => actions.setDrawingLayerLocked(r, file, l.name, locked), q)
      return (withLayers.site.parcels ?? []).some((x) => x.file === file) ? actions.setParcelsLocked(withLayers, file, locked) : withLayers
    }, p),
  )
}
