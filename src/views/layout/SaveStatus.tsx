// What this browser has of the project (Decision "Save in the app"), right after the project's name in the top bar:
//   Saved <time>       this browser keeps the project as it is
//   Unsaved changes    it changed since (with autosave on, for the moment before it is kept)
//   Not saved          the last attempt to keep it failed (the browser would not, or the copy read back differs)
//   Not saved yet      this browser has not kept it and nothing changed (the demo just opened)
// Its icon and its click are autosave, on or off. Its tooltip says where the copy lives, and that Export › Project
// (.gft) is the backup. On a phone, and on a window narrower than the side panels' columns (880 px), the icon alone.
import { useEffect } from 'react'
import { useApp } from '../../state/store.ts'
import { keyOrMenu } from '../commands/shortcuts.ts'
import { Icon } from '../controls/Icon.tsx'
import { BLOCK_EDITOR_ID, TERRAIN_EDITOR_ID } from '../home/editorId.ts'
import { usePhone } from './media.ts'
import { startAutosave, toggleAutosave, useSaving } from './saving.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const time = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** Autosave while the app is open (App mounts it once). */
export function useAutosave(): void {
  useEffect(() => startAutosave(), [])
}

export function SaveStatus() {
  const autosave = useSaving((s) => s.autosave)
  const savedAt = useSaving((s) => s.savedAt)
  const kept = useSaving((s) => s.kept)
  const failed = useSaving((s) => s.failed)
  const same = useApp((s) => s.project === kept)
  const touched = useApp((s) => s.history.past.length > 0)
  const editor = useApp((s) => s.project.id === BLOCK_EDITOR_ID || s.project.id === TERRAIN_EDITOR_ID)
  const phone = usePhone()
  const when = savedAt === null ? null : time(savedAt)
  const text = failed ? tr('Not saved') : same && when ? `${tr('Saved')} ${when}` : kept === null && !touched ? tr('Not saved yet') : tr('Unsaved changes')
  const unsaved = text === 'Unsaved changes' || text === 'Not saved'
  const where = `This browser keeps a copy of the project (all its options) at this address; clearing the browser’s data removes it. File › Export › Project (.gft) is the backup.`
  const title = `${autosave ? `Autosave is on: every change is kept a moment after it, and a reload opens it${when ? ` (last at ${when})` : ''}.` : `Autosave is off${unsaved ? ': there are changes this browser has not kept' : ''}. ${keyOrMenu('file.save', 'File › Save')} keeps the project.`} ${where} Click to turn autosave ${autosave ? 'off' : 'on'}.`

  // the editors' projects are never kept (their own Save goes to a library): nothing to say about them
  if (editor) return null
  return (
    <button
      type="button"
      data-tour="save"
      aria-label={autosave ? 'Autosave on' : unsaved ? 'Autosave off, changes not kept' : 'Autosave off'}
      aria-pressed={autosave}
      title={title}
      onClick={toggleAutosave}
      className={`pressable relative flex h-7 shrink-0 items-center gap-1.5 rounded-control px-1.5 text-caption hover:bg-hover hover:text-ink ${failed ? 'text-status-over' : 'text-ink-tertiary'}`}
    >
      <Icon name={autosave ? 'cloudCheck' : 'cloudOff'} className="h-4 w-4" />
      {!phone && <span className="hidden whitespace-nowrap tabular-nums panel:inline">{text}</span>}
      {!autosave && unsaved && <span aria-hidden data-unsaved className="absolute left-1 top-1 h-1.5 w-1.5 rounded-pill bg-status-over" />}
    </button>
  )
}
