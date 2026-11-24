// A name being renamed in place, in a tree's row (the Buildings tree's, Layers'): Enter or leaving the field keeps it
// (null: unchanged or empty), Escape leaves it as it was. The Escape is the field's: the plan keeps its selection.
import { useRef, useState } from 'react'

/** The field: `onDone` hears the new name, or null when nothing changed. */
export function NameField({ label, value, onDone }: { label: string; value: string; onDone(v: string | null): void }) {
  const [draft, setDraft] = useState(value)
  // once: Escape closes it, and the blur that may follow must not keep the draft
  const done = useRef(false)
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  const keep = () => finish(draft.trim() && draft.trim() !== value ? draft.trim() : null)
  return (
    <input
      aria-label={label}
      autoFocus
      className="h-row min-w-0 flex-1 select-text rounded-control border border-ink bg-panel-sunken px-1.5 text-body text-ink outline-none"
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={keep}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          finish(null)
        }
      }}
    />
  )
}
