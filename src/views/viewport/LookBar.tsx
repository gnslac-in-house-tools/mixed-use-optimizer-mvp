// The bar over the viewport while it shows a look (Decision "Specimen preview"): what it is ("Specimen #23 · 1 of
// 57"), ‹ › through its owner's list, its owner's actions (Keep as option) and Back to my design (Escape too:
// useShortcuts.ts). Top centre, on glass: the levels rail is top right, the pipeline's card top left.
import { endLook, useLook } from './look.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const STEP = 'pressable grid h-row w-row place-items-center rounded-control text-headline text-ink hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent'

export function LookBar() {
  const look = useLook((s) => s.look)
  if (!look) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4 phone:top-3">
      <div role="toolbar" aria-label="Preview" className="glass pointer-events-auto flex max-w-full items-center gap-1 rounded-glass px-1.5 py-1 shadow-glass">
        <button type="button" aria-label="Previous" title={tr("The previous one in the list")} disabled={!look.prev} onClick={() => look.prev?.()} className={STEP}>
          ‹
        </button>
        <span className="min-w-0 truncate px-1 text-label tabular-nums text-ink" title={tr("Read only: to edit it, keep it first")}>
          {look.title}
        </span>
        <button type="button" aria-label="Next" title={tr("The next one in the list")} disabled={!look.next} onClick={() => look.next?.()} className={STEP}>
          ›
        </button>
        <span aria-hidden className="mx-1 h-4 w-px bg-separator" />
        {look.actions?.map((a) => (
          <button
            key={a.label}
            type="button"
            title={a.title}
            disabled={a.disabled}
            onClick={a.onSelect}
            className="pressable h-row shrink-0 rounded-control bg-fill px-2.5 text-label text-ink hover:bg-hover disabled:opacity-40 disabled:hover:bg-fill"
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          title={tr("Back to my design (Escape)")}
          onClick={() => endLook()}
          className="pressable h-row shrink-0 rounded-control px-2.5 text-label text-ink hover:bg-hover"
        >
          {tr("Back to my design")}
        </button>
      </div>
    </div>
  )
}
