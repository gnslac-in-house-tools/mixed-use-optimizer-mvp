// The terrain editor (Decision "Home libraries"): a drawing or a geolocated file uploaded to Home's Terrain goes through
// the site import (its survey, its boundary picked on the plan), on a project of its own
// (`TERRAIN_EDITOR_ID`, a Blank project), never kept in this browser's projects, as the block editor's. Its bar
// (TerrainEditorBar.tsx) names the terrain and saves it to the library (the site without its rules: io/terrains.ts);
// closing goes back to Home's Terrain and to the project the store held, asking first when the site changed since it
// was saved.
import { create } from 'zustand'
import { newTerrainId, terrainOf } from '../../io/terrains.ts'
import type { Id, Project } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { newProject } from '../../typologies/index.ts'
import { holdProject, onEditorSave, restoreProject, type HeldProject } from '../layout/saving.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { importSiteFile } from '../plan/site/importState.ts'
import { TERRAIN_EDITOR_ID } from './editorId.ts'
import { showHome, useScreen } from './screen.ts'
import { libraryTerrain, saveTerrain } from './terrainLibrary.ts'

export { TERRAIN_EDITOR_ID } from './editorId.ts'

export const UNSAVED_TERRAIN = 'This terrain changed since it was last saved to the library, and the changes will be lost. Close it anyway?'

interface TerrainEditorState {
  open: boolean
  /** The terrain's name, as its bar says it. */
  name: string
  /** Its id in the library once saved; null: never saved. */
  id: Id | null
  /** The site as last saved; null: never saved. */
  saved: string | null
  /** What the store held before: given back on closing. */
  back: HeldProject | null
}

export const useTerrainEditor = create<TerrainEditorState>()(() => ({ open: false, name: '', id: null, saved: null, back: null }))

/** The site as saving compares it: all but its rules. */
function snapshot(p: Project): string {
  const { rules: _, ...rest } = p.site
  return JSON.stringify(rest)
}

/** The terrain's name from its file's: the name without its extension. */
export const nameOfFile = (file: string) => file.replace(/\.[^.]+$/, '').trim() || 'Terrain'

/** Opens the terrain editor on `file`, Layers open and the file importing. */
export function openTerrainEditor(file: File): void {
  const s = useApp.getState()
  const back = holdProject()
  s.open({ ...newProject('blank', 'Terrain editor'), id: TERRAIN_EDITOR_ID })
  useTerrainEditor.setState({ open: true, name: nameOfFile(file.name), id: null, saved: null, back })
  // the address stays Home's (a reload goes back there)
  useScreen.setState({ home: false })
  useUi.getState().setRail('layers')
  void importSiteFile(file)
}

/** Whether there is something to save: a boundary or a ground. */
export function terrainReady(p: Project = useApp.getState().project): boolean {
  return !!p.site.boundary || !!p.site.terrain?.contours.length || !!p.site.terrain?.points.length
}

/** Saves the site to this browser's terrains (over its last save, its next version); what went wrong in the toast. */
export function saveEditedTerrain(): void {
  const { show } = useToast.getState()
  const p = useApp.getState().project
  const { name, id } = useTerrainEditor.getState()
  if (!terrainReady(p)) return show('error', 'Nothing to save yet: finish the import (its boundary picked, or its contours) first.')
  // nothing changed since the last save (the site, the name): no new version on every press
  if (id && !terrainUnsaved() && libraryTerrain(id)?.terrain.name === (name.trim() || 'Terrain')) return show('info', 'This terrain is already saved in the library.')
  // a later version, so its .gfs takes the place of an earlier one's (Upload, the published shelf)
  const version = (id ? (libraryTerrain(id)?.terrain.version ?? 0) : 0) + 1
  const t = terrainOf(p.site, { id: id ?? newTerrainId(), name: name.trim() || 'Terrain', version })
  if (!saveTerrain(t)) return show('error', 'This browser’s storage is full or blocked: the terrain was not saved.')
  useTerrainEditor.setState({ id: t.id, saved: snapshot(p), name: t.name })
  show('info', `Saved “${t.name}” to this browser’s terrains.`)
}

// Ctrl+S in the editor (saving.ts) is its Save to library
onEditorSave(TERRAIN_EDITOR_ID, saveEditedTerrain)

/** Whether the site changed since it was last saved (one never saved counts as changed once it has something). */
export function terrainUnsaved(): boolean {
  const { open, saved } = useTerrainEditor.getState()
  const p = useApp.getState().project
  return open && (saved === null ? terrainReady(p) : snapshot(p) !== saved)
}

/** Ends the editor: the store's project back as it was. */
function end(): void {
  const { back } = useTerrainEditor.getState()
  useTerrainEditor.setState({ open: false, name: '', id: null, saved: null, back: null })
  if (back) {
    restoreProject(back)
  }
}

/**
 * Leaves the editor, then `then`: asking first when the terrain has changes not saved. Every way out takes it — its
 * Close, and through files.ts's `leave` the top bar's GFit, a project opened or started, a .gft dropped, Back — so the
 * editor never stays open over another project.
 */
export function leaveTerrainEditor(then: () => void): void {
  if (!useTerrainEditor.getState().open) return then()
  const go = () => {
    end()
    then()
  }
  if (!terrainUnsaved()) return go()
  useToast.getState().confirm(UNSAVED_TERRAIN, go)
}

/** Closes the editor (asking first when unsaved): Home's Terrain again. */
export function closeTerrainEditor(): void {
  if (!useTerrainEditor.getState().open) return
  leaveTerrainEditor(() => {
    useScreen.setState({ homeView: 'terrains' })
    showHome()
  })
}
