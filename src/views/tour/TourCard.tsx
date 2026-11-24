// The tour's card (Decision "Tour"): beside the part of the app its step points at (`data-tour`), that part outlined;
// in the window's corner when the part is most of the window (a dialog), in the middle when there is none. Back,
// Chapters (skip ahead), Exit, and Next — in the sample tour it does what the step asks when the user has not; in From
// zero it waits for the step to be done, and *Do it for me* does it; a step's *Why* folds under its text. Over the app
// and its windows, never blocking them: the user may try each thing by hand.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { chapters, stepsOf, useTour } from './tour.ts'
import { startZero } from './zero/run.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const GAP = 12
const MARGIN = 16

interface Box {
  left: number
  top: number
  width: number
  height: number
}

const same = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1)

/** The element a step's anchor points at. A phone has the ☰ (`menu`) where a desktop has each menu (`menu-design`): a step that
 *  points at a menu points at the ☰ there. */
export function anchorElement(anchor: string): HTMLElement | null {
  const find = (a: string) => document.querySelector<HTMLElement>(`[data-tour="${a}"]`)
  return find(anchor) ?? (anchor.startsWith('menu-') ? find('menu') : null)
}

/** Where the step's anchor is now (null: none, or not shown), followed every frame: panels open and slide. A button of the Tools
 *  strip (`tool-…`) is scrolled into view once it is drawn: the strip scrolls when the window is short. */
function useAnchor(anchor: string | undefined): { box: Box | null; tick: number } {
  const [box, setBox] = useState<Box | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let frame = 0
    let last: Box | null = null
    let scrolled = false
    let n = 0
    const look = () => {
      const el = anchor ? anchorElement(anchor) : null
      if (el && !scrolled && anchor?.startsWith('tool-')) {
        scrolled = true
        el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      }
      const r = el?.getBoundingClientRect()
      const next = r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
      if (!same(next, last)) {
        last = next
        setBox(next)
      }
      // what the user did (Next ✓) is read again a few times a second
      if (++n % 15 === 0) setTick(n)
      frame = requestAnimationFrame(look)
    }
    look()
    return () => cancelAnimationFrame(frame)
  }, [anchor])
  return { box, tick }
}

/** The card's place: beside the anchor (right, left, below, above), else the corner of a large one, else the middle. */
function placeCard(box: Box | null, card: { width: number; height: number }): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampX = (x: number) => Math.min(Math.max(MARGIN, x), vw - card.width - MARGIN)
  const clampY = (y: number) => Math.min(Math.max(MARGIN, y), vh - card.height - MARGIN)
  if (!box) return { left: (vw - card.width) / 2, top: (vh - card.height) / 2 }
  const large = box.width * box.height > vw * vh * 0.35
  if (large) return { left: vw - card.width - MARGIN * 2, top: vh - card.height - MARGIN * 2 }
  const middleY = clampY(box.top + box.height / 2 - card.height / 2)
  const middleX = clampX(box.left + box.width / 2 - card.width / 2)
  if (box.left + box.width + GAP + card.width <= vw - MARGIN) return { left: box.left + box.width + GAP, top: middleY }
  if (box.left - GAP - card.width >= MARGIN) return { left: box.left - GAP - card.width, top: middleY }
  if (box.top + box.height + GAP + card.height <= vh - MARGIN) return { left: middleX, top: box.top + box.height + GAP }
  return { left: middleX, top: clampY(box.top - GAP - card.height) }
}

export function TourCard() {
  const active = useTour((s) => s.active)
  const index = useTour((s) => s.index)
  const tutorial = useTour((s) => s.tutorial)
  const { next, back, exit, start, doIt } = useTour.getState()
  const steps = stepsOf(tutorial)
  const step = steps[index]
  const { box } = useAnchor(active ? step?.anchor : undefined)
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ left: -9999, top: -9999 })
  const [menu, setMenu] = useState(false)
  // what the user did (Next ✓) read again four times a second, frames or none (a window in the background draws none)
  const [, setBeat] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setBeat((n) => n + 1), 250)
    return () => window.clearInterval(t)
  }, [active])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const next = placeCard(box, { width: el.offsetWidth, height: el.offsetHeight })
    setAt((a) => (Math.abs(a.left - next.left) < 1 && Math.abs(a.top - next.top) < 1 ? a : next))
  })

  if (!active || !step) return null
  const list = chapters(tutorial)
  const inChapter = steps.filter((s) => s.chapter === step.chapter)
  const done = step.done?.() ?? false
  const last = index === steps.length - 1
  const outline = box && box.width * box.height <= window.innerWidth * window.innerHeight * 0.35
  const zero = tutorial === 'zero'
  // From zero waits for the step; the sample tour's Next does it for the user
  const waits = zero && !!step.done && !done
  const nextLabel = last ? 'Finish' : !zero && step.act && !done ? 'Next · do it for me' : done ? 'Next ✓' : 'Next'

  return (
    <>
      {outline && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[70] rounded-control outline outline-2 outline-offset-2 outline-ink transition-all"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      <div
        ref={ref}
        role="dialog"
        aria-label={`Tour: ${step.title}`}
        data-tour-card
        className="panel fixed z-[70] flex select-text w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-3 p-5 shadow-sheet"
        style={{ left: at.left, top: at.top }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-ink-secondary">
            {list.indexOf(step.chapter) + 1}/{list.length} · {step.chapter} · {inChapter.indexOf(step) + 1}/{inChapter.length}
          </span>
          <button type="button" onClick={exit} className="pressable rounded-control px-2 py-0.5 text-caption text-ink-secondary hover:bg-hover hover:text-ink">
            {tr("Exit")}
          </button>
        </div>
        <h2 className="text-headline text-ink">{step.title}</h2>
        {step.body.map((t) => (
          <p key={t} className="text-body text-ink-secondary">
            {t}
          </p>
        ))}
        {step.action && (
          <button
            type="button"
            onClick={() => void step.action!.run()}
            className="pressable self-start rounded-control px-3 py-1.5 text-label text-ink-segment shadow-[inset_0_0_0_1px_var(--separator)] hover:bg-hover hover:text-ink"
          >
            {step.action.label}
          </button>
        )}
        {step.why && (
          <details className="text-body text-ink-secondary">
            <summary className="cursor-pointer text-label text-ink-segment hover:text-ink">{tr("Why")}</summary>
            <p className="mt-1">{step.why}</p>
          </details>
        )}
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            className="pressable rounded-control px-2 py-1.5 text-label text-ink-segment hover:bg-hover hover:text-ink"
          >
            Chapters ▾
          </button>
          {menu && (
            <div role="menu" aria-label="Chapters" className="panel absolute bottom-full left-0 z-10 mb-1 flex w-max flex-col p-1.5 shadow-sheet">
              {list.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false)
                    // From zero: a chapter on its own starts from the project as it would be there (zero/run.ts)
                    if (tutorial === 'zero') void startZero(c)
                    else start(c, tutorial)
                  }}
                  className={`pressable rounded-control px-3 py-1.5 text-left text-label hover:bg-hover ${c === step.chapter ? 'text-ink' : 'text-ink-secondary'}`}
                >
                  {i + 1}. {c}
                </button>
              ))}
            </div>
          )}
          <span className="flex-1" />
          <button
            type="button"
            disabled={index === 0}
            onClick={back}
            className="pressable rounded-control px-3 py-1.5 text-label text-ink-segment hover:bg-hover hover:text-ink disabled:opacity-40"
          >
            {tr("Back")}
          </button>
          {zero && step.act && !done && (
            <button
              type="button"
              onClick={() => void doIt()}
              className="pressable rounded-control px-3 py-1.5 text-label text-ink-segment hover:bg-hover hover:text-ink"
            >
              {tr("Do it for me")}
            </button>
          )}
          <button
            type="button"
            disabled={waits}
            onClick={next}
            className="pressable rounded-control bg-ink px-3 py-1.5 text-label text-on-ink hover:opacity-90 disabled:opacity-40"
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </>
  )
}
