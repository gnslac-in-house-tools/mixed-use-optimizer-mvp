// Load, export and start projects from the File menu (Export › its files) and Home (saving is saving.ts, Decision "Save in the app"). Port of Plaza-Practiko
// `vistas/paneles/archivos.ts`. What a file means lives in `io/gft.ts` (pure); this module only touches the browser
// (file reading, the picker, the library) and the store. A failure never changes the project: it shows in the notice.
// Since Decision "Library" each project is kept in this browser under its own id, so leaving one loses nothing that
// autosave kept; with autosave off, leaving changes it never kept asks first. A file opened is never written again:
// the project is kept in this browser, and File › Export › Project (.gft) is the file.
import type { Id, LibraryTerrain, Project } from '../../model/schema.ts'
import { readBrowserCopy } from '../../io/browserCopy.ts'
import { fileName, openedNotice, readGft, writeGft } from '../../io/gft.ts'
import { library, type Summary } from '../../io/library.ts'
import { sameData } from '../../io/same.ts'
import { siteOf } from '../../io/terrains.ts'
import { upToDate } from '../../modules/warehouse/views/blockLibrary.ts'
import { demoProject } from '../../state/demo.ts'
import { SAMPLE_ID, sampleProject } from '../../state/sample.ts'
import { useApp } from '../../state/store.ts'
import { newProject, newProjectId, TYPOLOGIES } from '../../typologies/index.ts'
import { leaveBlockEditor, useBlockEditor } from '../home/blockEditor.ts'
import { showHome, showProject, useScreen } from '../home/screen.ts'
import { leaveTerrainEditor, useTerrainEditor } from '../home/terrainEditor.ts'
import { projectThumb } from '../home/thumb.ts'
import { useTour } from '../tour/tour.ts'
import { cancelled, download, pickOpenFile, pickSaveFile, readText } from './browserIo.ts'
import { keyOrMenu } from '../commands/shortcuts.ts'
import { keep, unkept, useSaving } from './saving.ts'
import { useToast } from './toast.ts'
import { useUi } from './ui.ts'

/** What leaving a project with changes this browser has not kept asks; `why` it has not: autosave is off, or the keep failed. */
export const replaceText = (why: string) => `The current project has changes this browser has not kept (${why}), and will be left. Save it first (${keyOrMenu('file.save', 'File › Save')}) to keep it. Continue?`

/**
 * Leaves the project in the store, then `then`: what changed is kept first (autosave on); else it asks. An editor's
 * project (the block's, the terrain's) is left through its editor (its own question), which gives back the project it
 * held: that one is left then as any other.
 */
export function leave(then: () => void): void {
  if (useBlockEditor.getState().open) return leaveBlockEditor(() => leave(then))
  if (useTerrainEditor.getState().open) return leaveTerrainEditor(() => leave(then))
  if (!unkept()) return then()
  const { autosave } = useSaving.getState()
  if (autosave && keep()) return then()
  useToast.getState().confirm(replaceText(autosave ? 'this browser could not keep it' : 'autosave is off'), then)
}

/** Opens `p` in place of the current project, at `option`; `kept`: this browser keeps it at once. `opened`: after. */
function replaceProject(
  p: Project,
  notice: string,
  opened?: () => void,
  { option = null as Id | null, keepIt = false, before, migrated = false }: { option?: Id | null; keepIt?: boolean; before?: (go: (p: Project, notice: string) => void) => void; migrated?: boolean } = {},
): void {
  leave(() => {
    // `before`: a question after the one about the open project, which may open another project (a copy) in its place
    const go = (p: Project, notice: string) => open(p, notice)
    if (before) before(go)
    else go(p, notice)
  })
  function open(p: Project, notice: string): void {
    // its blocks linked to the library brought up to their newest (Decision "Block library"), and kept so
    const fresh = upToDate(p)
    useApp.getState().open(fresh.project)
    if (option) useApp.getState().setOption(option)
    if (keepIt) keep()
    showProject()
    opened?.()
    // what migrating changed in a kept copy is kept, so that the report is said once
    if (fresh.names.length || migrated) keep()
    const updated = fresh.names.length ? `Brought up to date from the block library: ${fresh.names.join(', ')}.` : ''
    const said = [notice, updated].filter(Boolean).join(' ')
    if (said) useToast.getState().show('info', said)
  }
}

/** Home: the project in the store is kept (or left, asked) and Home shows. */
export function goHome(): void {
  leave(showHome)
}

/** Opens the project this browser keeps as `id` (Home, the address), at `option` (default: as it was left); false when it is not there. */
export function openKept(id: Id, option: Id | null = null): boolean {
  const c = readBrowserCopy(id)
  if (!c) return false
  // a copy kept before the blocks says what became of its masses, and is kept again as it opens (the next opening says nothing)
  const notes = c.notes ?? []
  replaceProject(c.project, notes.length ? openedNotice(c.project.name, notes) : '', () => useSaving.setState({ kept: useApp.getState().project, savedAt: c.savedAt }), { option: option ?? c.option, migrated: notes.length > 0 })
  return true
}

/**
 * The sample project (Decision "Sample project"): as this browser kept it, else as it comes; `fresh`: as it comes
 * whatever was kept. `tour`: the tour starts at once; else it is offered.
 */
export function openSample({ fresh = false, tour = false, option = null as Id | null } = {}): void {
  const c = fresh ? null : readBrowserCopy(SAMPLE_ID)
  // a sample kept before the blocks says what became of its masses, and is kept again as it opens (as a kept project's is)
  const notes = c?.notes ?? []
  replaceProject(
    c?.project ?? sampleProject(),
    notes.length && c ? openedNotice(c.project.name, notes) : '',
    () => {
      if (c) useSaving.setState({ kept: useApp.getState().project, savedAt: c.savedAt })
      if (tour) useTour.getState().start()
      else useTour.getState().setOffer(true)
    },
    { option: option ?? c?.option ?? null, migrated: notes.length > 0 },
  )
}

/** The sample as it comes again: what this browser kept of it is forgotten. */
export function resetSample(): void {
  library.remove(SAMPLE_ID)
}

/** A kept project, or the sample as it comes when this browser has not kept it. */
const keptOrSample = (id: Id): Project | null => library.read(id)?.project ?? (id === SAMPLE_ID ? sampleProject() : null)

/** A copy of a kept project (or of the sample), kept beside it as “<name> (copy)”, with its summary. */
export function duplicateKept(id: Id, summary?: Summary): void {
  const from = keptOrSample(id)
  if (!from) return
  const p = { ...from, id: newProjectId(), name: `${from.name} (copy)` }
  const option = library.read(id)?.option ?? p.options[0].id
  if (!library.write(p, option, Date.now(), projectThumb(p, option), summary)) useToast.getState().show('error', 'This browser’s storage is full: export a project as .gft and remove it here.')
}

/** Saves a kept project (or the sample) as a .gft without opening it: a download. */
export function saveKept(id: Id): void {
  const p = keptOrSample(id)
  if (p) download(new Blob([writeGft(p)], { type: 'application/json' }), fileName(p.name))
}

/**
 * File › Export › Project (.gft): the open project, all its options, as a file: where the browser has a picker it asks where,
 * else a download. An export, not a save: what the app counts as saved (`useSaving`) is not touched.
 */
export async function exportGft(): Promise<void> {
  const { show } = useToast.getState()
  const { project } = useApp.getState()
  const name = fileName(project.name)
  try {
    const picked = pickSaveFile(name)
    if (!picked) {
      download(new Blob([writeGft(project)], { type: 'application/json' }), name)
      show('info', `Exported “${name}”: all its options.`)
      return
    }
    const h = await picked
    const out = await h.createWritable()
    await out.write(writeGft(project))
    await out.close()
    show('info', `Exported “${h.name}”: all its options.`)
  } catch (e) {
    if (!cancelled(e)) show('error', `Could not export the file: ${e instanceof Error ? e.message : String(e)}.`)
  }
}

/** Forgets a kept project in this browser (Home asks first). */
export function removeKept(id: Id): void {
  library.remove(id)
}

/** Opens a .gft file; `opened` runs once it replaced the project. */
export async function openGft(f: File, opened?: () => void): Promise<void> {
  const { show } = useToast.getState()
  try {
    const r = readGft(await readText(f))
    if (!r.ok) {
      show('error', `Could not open ${f.name}: ${r.error}`)
      return
    }
    const file = r.project
    const notice = openedNotice(file.name, r.notes)
    // a file keeps its project's id: this browser may keep a different version of it, which opening would write over
    const before = (go: (p: Project, notice: string) => void) => {
      const kept = library.read(file.id)
      if (!kept || sameData(kept.project, file)) return go(file, notice)
      const copy = { ...file, id: newProjectId(), name: `${file.name} (copy)` }
      useToast.getState().confirm(
        `This browser keeps a different “${file.name}” (changes made after the file was exported, perhaps). Replace it with the file, or open the file as a copy?`,
        () => go(file, notice),
        'Replace it with the file',
        { label: 'Open the file as a copy', run: () => go(copy, `Opened “${file.name}” as a copy, “${copy.name}”: this browser keeps the other.`) },
      )
    }
    replaceProject(file, notice, opened, { keepIt: true, before })
  } catch (e) {
    show('error', `Could not open ${f.name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Load project: Chrome's and Edge's picker; elsewhere `fallback` (an input). The file is read, not adopted: Save keeps the project in this browser. */
export async function openFile(fallback: () => void): Promise<void> {
  const picked = pickOpenFile()
  if (!picked) return fallback()
  try {
    const h = await picked
    await openGft(await h.getFile())
  } catch (e) {
    if (!cancelled(e)) useToast.getState().show('error', `Could not open the file: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Load project: the picker, or the top bar's `.gft` input where the browser has no picker (Ctrl+O,
 * File › Load project…). The input is found in the document: the top bar's, or Home's.
 */
export function loadProject(): Promise<void> {
  return openFile(() => document.querySelector<HTMLInputElement>('input[type="file"][aria-label="Open .gft"]')?.click())
}

/** The sample's guided tour: on the sample it starts; elsewhere the sample opens as it comes, and it starts. */
export function startSampleTour(): void {
  if (useApp.getState().project.id === SAMPLE_ID) useTour.getState().start()
  else openSample({ fresh: true, tour: true })
}

/** Home on its About page (what the project has not kept is asked about first, as Home's button does). */
export function openAbout(): void {
  const about = () => useScreen.setState({ homeView: 'about' })
  if (useScreen.getState().home) return about()
  leave(() => {
    showHome()
    about()
  })
}

/**
 * A new, empty project from a typology (its programs and rules): without a site (Site › Import… or Draw boundary), or
 * on a library terrain (Decision "Home libraries"), under the typology's rules. `named`: its name (From zero's "My first
 * project"), else "New <typology> project".
 */
export function startProject(typologyId: string, terrain?: LibraryTerrain, named?: string): void {
  const t = TYPOLOGIES.find((x) => x.id === typologyId)
  if (!t) return
  const name = named ?? `New ${t.name.toLowerCase()} project`
  const blank = newProject(t.id, name)
  const p = terrain ? { ...blank, site: siteOf(terrain, blank.site.rules) } : blank
  const notice = terrain ? `${name} on ${terrain.name}.` : `${name}: no site yet (Site › Import…, or Site › Draw boundary).`
  replaceProject(p, notice, () =>
    // where it starts: Layers, where the site's rows come next
    useUi.getState().setRail('layers'),
    { keepIt: true },
  )
}

/** Back to the demo project: the way out when a project ends up in a state you do not know how to leave. */
export function openDemo(): void {
  replaceProject(demoProject(), 'Opened the demo project.')
}
