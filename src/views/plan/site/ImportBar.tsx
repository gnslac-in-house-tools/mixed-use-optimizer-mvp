// The bar over the viewport while a geolocated file with several shapes is imported (Decision "Site step layout"):
// which file and "click the site's boundary"; *Use the largest* picks the biggest shape; Cancel (Escape) drops it.
// A drawing or a table is surveyed in its window instead (SurveyWindow.tsx). Top centre, on glass, like the preview
// bar (LookBar.tsx).
import { useEffect } from 'react'
import { useSiteImport } from './importState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

const BUTTON = 'pressable h-row shrink-0 rounded-control px-2.5 text-label text-ink hover:bg-hover'

export function ImportBar() {
  const pending = useSiteImport((s) => (s.pending?.kind === 'geo' ? s.pending : null))
  const open = pending !== null
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useSiteImport.getState().cancel()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])
  if (!pending) return null
  const { pick, cancel } = useSiteImport.getState()
  const n = pending.candidates.length
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4 phone:top-3">
      <div role="toolbar" aria-label="Import" className="glass pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-glass px-2 py-1 shadow-glass">
        <span className="min-w-0 truncate px-1 text-label text-ink">
          <span className="font-semibold">{pending.file.name}</span> · click the site’s boundary ({n} shape{n === 1 ? '' : 's'})
        </span>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-separator" />
        <button type="button" title="Make the largest shape the boundary" onClick={() => pick(0)} className={`${BUTTON} bg-fill`}>
          {tr("Use the largest")}
        </button>
        <button type="button" title="Leave the site as it was (Escape)" onClick={cancel} className={BUTTON}>
          {tr("Cancel")}
        </button>
      </div>
    </div>
  )
}
