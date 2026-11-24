// A note picked (on the plan or in Layers), in Properties (Phase AS.5, Decision "Notes"): its text, its size (Small, Medium or Large), its angle (read-only: the Rotate tool turns it) and
// Delete. Its text is its name: F2, the menu's Rename and a double click on the note put the focus in the text field with every word selected (`editing/rename.ts`), and a note placed
// just now opens so. The field takes several lines: Enter is a new line (the plan's keys leave a field alone), Tab or a click elsewhere leaves it, Escape drops what was typed. **It is saved when the field is left**
// (as a lot's name is, `TextField`), one undo step however much was typed; and also when the card goes while the field still has words that were not saved (a click on the plan lets the
// pick go before the browser moves the focus, and the words must not be lost). A text of blank space changes nothing: a note is deleted, not blanked. A locked note (the padlock is CAD's)
// is read-only and says so.
import { useEffect, useRef, useState } from 'react'
import { noteName } from '../../engine/annotations.ts'
import type { Id, NoteSize } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { useRenameField } from '../editing/rename.ts'
import { Button, Total } from '../controls/fields.tsx'
import { Segmented } from '../controls/Segmented.tsx'
import { lockedFirst } from '../layers/locks.ts'
import { letGoKind } from '../plan/mix.ts'
import { Lockable } from './Lockable.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** The sizes a note has: the middle one is no `size` at all. */
const SIZES: { key: NoteSize | 'medium'; label: string }[] = [
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
]

/** An angle as the lists say it ("90°", "37.5°"). */
const degrees = (v: number): string => `${Math.round(v * 10) / 10}°`

/** What was typed and not saved yet: for which note, over which text, and what it says now. */
interface Typed {
  id: Id
  base: string
  text: string
}

export function NoteProperties({ id, muted, answersRename = true }: { id: Id; muted: string; answersRename?: boolean }) {
  const note = useApp((s) => s.project.notes?.find((n) => n.id === id))
  const apply = useApp((s) => s.apply)
  const [draft, setDraft] = useState<string | null>(null)
  const typed = useRef<Typed | null>(null)
  const area = useRenameField<HTMLTextAreaElement>('note', id, answersRename)

  /** Saves what was typed (one undo step), if it is a change. */
  const save = (): void => {
    const t = typed.current
    typed.current = null
    setDraft(null)
    if (t && t.text !== t.base) apply((p) => actions.setNoteText(p, t.id, t.text))
  }
  // the card goes with words not saved (the note was picked away, the tab changed): they are saved, unless the note is not the same any more
  useEffect(
    () => () => {
      const t = typed.current
      typed.current = null
      if (!t || t.text === t.base) return
      const now = useApp.getState()
      if (now.project.notes?.find((n) => n.id === t.id)?.text === t.base) now.apply((p) => actions.setNoteText(p, t.id, t.text))
    },
    [],
  )
  if (!note) return null
  const locked = note.locked === true
  const lineCount = (draft ?? note.text).split('\n').length
  return (
    <section aria-label="Note" className="flex flex-col gap-3">
      <h2 className="text-headline">{noteName(note.text)}</h2>
      <Lockable locked={locked} muted={muted}>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-label text-ink-secondary">{tr("Text")}</span>
          <textarea
            ref={area}
            rows={Math.min(8, Math.max(3, lineCount))}
            disabled={locked}
            value={draft ?? note.text}
            title={tr("Enter is a new line. It is saved when you leave the field; Escape drops what was typed.")}
            className="w-full min-w-0 resize-y select-text rounded-control border border-separator bg-panel-sunken px-2 py-1 text-body text-ink outline-none focus:border-ink disabled:border-transparent disabled:bg-transparent disabled:text-ink-secondary"
            onChange={(e) => {
              typed.current = { id, base: typed.current?.base ?? note.text, text: e.target.value }
              setDraft(e.target.value)
            }}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                typed.current = null
                setDraft(null)
                e.currentTarget.blur()
              }
            }}
          />
        </label>
        <Segmented<NoteSize | 'medium'>
          kind="toggle"
          label="Size"
          stretch
          value={note.size ?? 'medium'}
          onChange={(k) => apply((p) => actions.setNoteSize(p, id, k === 'medium' ? undefined : k))}
          options={SIZES}
        />
        <dl aria-label="Figures" className="flex flex-col gap-1.5">
          <Total label="Angle" value={degrees(note.angle ?? 0)} />
        </dl>
        <p className={`select-text text-caption ${muted}`}>{tr("Its angle is set with the Rotate tool.")}</p>
      </Lockable>
      <div>
        <Button
          title={locked ? lockedFirst(1, 'note') : 'Delete this note'}
          disabled={locked}
          onClick={() => {
            apply((p) => actions.removeNote(p, id))
            letGoKind('note')
          }}
        >
          {tr("Delete")}
        </Button>
      </div>
    </section>
  )
}
