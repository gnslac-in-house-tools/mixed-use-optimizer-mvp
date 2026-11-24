// As the sample opens (Decision "Tour"): there is a tour; take it, or skip it (Help › Sample tour, in the top menu, brings it back).
import { useEffect, useRef } from 'react'
import { chapters, useTour } from './tour.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export function TourOffer() {
  const offer = useTour((s) => s.offer)
  const take = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (offer) take.current?.focus()
  }, [offer])
  if (!offer) return null
  const { start, setOffer } = useTour.getState()
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/30 p-4" onKeyDown={(e) => e.key === 'Escape' && setOffer(false)}>
      <div role="dialog" aria-modal="true" aria-label="Take the tour?" className="panel flex w-[26rem] max-w-full select-text flex-col gap-3 p-6 shadow-sheet">
        <span className="text-caption uppercase tracking-wide text-ink-secondary">{tr("Sample project")}</span>
        <h2 className="text-title text-ink">{tr("Take the guided tour?")}</h2>
        <p className="text-body text-ink-secondary">
          About ten minutes over this project, in {chapters().length} chapters: {chapters().join(', ')}. Press Next only, or try each step yourself;
          skip chapters at any time.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => setOffer(false)} className="pressable rounded-control px-4 py-2 text-label text-ink-segment hover:bg-hover hover:text-ink">
            {tr("Skip")}
          </button>
          <button ref={take} type="button" onClick={() => start()} className="pressable rounded-control bg-ink px-4 py-2 text-label text-on-ink hover:opacity-90">
            ▶ Take the tour
          </button>
        </div>
        <p className="text-caption text-ink-secondary">Help › Sample tour, in the top menu, brings it back later.</p>
      </div>
    </div>
  )
}
