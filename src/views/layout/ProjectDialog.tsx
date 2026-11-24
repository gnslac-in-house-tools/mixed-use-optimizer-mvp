// "Project data", opened from the project's name in the top bar. Frame ported from Plaza-Practiko
// `vistas/paneles/DialogoFicha.tsx`; today it holds the name and the units CAD exports use (Decision "Project units"), and shows the typology (chosen at New project, Decision
// "Typology in the UI"). Client, location and team join when the presentation and PDF plans need them (Phase 10).
// Save is one more edit (Ctrl+Z undoes it); Cancel or Escape change nothing. Whether it is open is `useProjectData`: the
// top bar's name and File › Project data… (commands/file.ts) open it, the top bar shows it.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { create } from 'zustand'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { TYPOLOGIES } from '../../typologies/index.ts'
import { Segmented } from '../controls/Segmented.tsx'
import { trapTab } from '../controls/focus.ts'

/** Whether the project's data window is open (per session, never saved). */
export const useProjectData = create<{ open: boolean }>()(() => ({ open: false }))
export const openProjectData = (): void => useProjectData.setState({ open: true })
export const closeProjectData = (): void => useProjectData.setState({ open: false })

const FIELD = 'w-full rounded-control bg-fill px-2 py-1.5 text-body outline-none placeholder:text-ink-tertiary focus:bg-hover'

export function ProjectDialog({ onClose }: { onClose: () => void }) {
  const [initial] = useState(() => useApp.getState().project)
  const [name, setName] = useState(initial.name)
  const [units, setUnits] = useState<'m' | 'ft'>(initial.units ?? 'm')
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const typology = TYPOLOGIES.find((t) => t.id === initial.typology)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    first.current?.focus()
    first.current?.select()
    return () => before?.focus?.()
  }, [])

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    // one edit: the name and the units are one undo step
    useApp.getState().apply((p) => actions.setProjectUnits(actions.renameProject(p, name), units))
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-gutter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="panel max-h-full w-full max-w-lg select-text overflow-y-auto p-panel-pad text-ink shadow-sheet outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Tab') return trapTab(e, root.current)
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
            return
          }
          // the shortcuts of the screen below do not act while typing here
          e.stopPropagation()
        }}
      >
        <h2 id={titleId} className="text-headline">
          Project data
        </h2>
        <form className="mt-4 flex flex-col gap-3" onSubmit={save}>
          <label className="block">
            <span className="mb-1 block text-label text-ink-secondary">Project name</span>
            <input ref={first} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className={FIELD} />
          </label>
          <div>
            <span className="mb-1 block text-label text-ink-secondary">Typology</span>
            <p className="text-body">{typology?.name ?? initial.typology}</p>
            <p className="mt-1 text-label text-ink-secondary">
              Chosen when the project is created (File › New project): it gave the project its programs and site rules.
            </p>
          </div>
          <div>
            <span className="mb-1 block text-label text-ink-secondary">Units</span>
            <Segmented
              kind="toggle"
              label="Units"
              options={[
                { key: 'm', label: 'm' },
                { key: 'ft', label: 'ft' },
              ]}
              value={units}
              onChange={setUnits}
            />
            <p className="mt-1 text-label text-ink-secondary">Used by CAD exports</p>
          </div>
          <div className="mt-1 flex justify-end gap-1">
            <button type="button" onClick={onClose} className="pressable rounded-control px-3 py-1.5 text-body font-medium hover:bg-hover">
              Cancel
            </button>
            <button type="submit" className="pressable rounded-control bg-fill px-3 py-1.5 text-body font-medium shadow-control hover:bg-hover">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
