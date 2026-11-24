// The Tools strip's group options (Project C, AS.2; spec "The Tools strip", the ▾ of a group): what stands beside a group's tool
// today and is set before using it. Massing: the program the next mass takes ("Draw makes"); Streets: the next street's type and
// side ("New street"). A pick in either takes the group's tool (Draw, Street) where the plan can be drawn on. General (AS.5): what Mirror,
// Array and Align take (a pick there takes no tool). A group with no parameter today has no ▾ (Decision "Only what works is shown"); Flow's settings stay in the
// panel until AS.3.
//   GROUP_OPTIONS   by group: the panel's name and what it holds
//   GroupOptions    the ▾ at the end of a group and its panel: a portal on the body, beside the group (to the right of an upright
//                   strip, under a flat one), placed with `placeInWindow` so it stays inside the window, in the panels' paper.
//                   The strip owns which one is open (one at a time); a press outside or Escape closes it (the focus goes back to
//                   the ▾), a press inside it does not.
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../controls/Icon.tsx'
import { placeInWindow } from '../controls/place.ts'
import { useCloseOutside } from '../controls/useCloseOutside.ts'
import type { ToolGroup } from '../commands/types.ts'
import { StreetSideChip } from '../plan/circulation/StreetSideChip.tsx'
import { StreetTypeChip } from '../plan/circulation/StreetTypeChip.tsx'
import { take } from './hand.ts'
import { GeneralOptions } from './GeneralOptions.tsx'
import { MassProgram } from './MassProgram.tsx'
import { planToolsRefusal } from './pickTool.ts'

/** A street's type or side picked in the ▾: Street is in hand, as a program picked takes Draw; the pick is kept either way. */
function takeStreet(): void {
  if (planToolsRefusal() === true) take('street')
}

export const GROUP_OPTIONS: Partial<Record<ToolGroup, { label: string; View: () => React.JSX.Element }>> = {
  general: { label: 'Mirror, Array and Align', View: GeneralOptions },
  massing: { label: 'Draw makes', View: MassProgram },
  streets: {
    label: 'New street',
    View: () => (
      <div className="flex flex-col gap-1.5">
        <StreetTypeChip onPick={takeStreet} />
        <StreetSideChip onPick={takeStreet} />
      </div>
    ),
  },
}

/** The gap between the ▾ and its panel. */
const GAP = 4

/** The panel, beside the ▾ it opens from: its edge on the ▾'s, flipped to the other side when the window has no room. */
function Panel({ label, view: View, anchor, flat, box }: { label: string; view: () => React.JSX.Element; anchor: React.RefObject<HTMLElement | null>; flat: boolean; box: React.RefObject<HTMLDivElement | null> }) {
  const [at, setAt] = useState<CSSProperties>({ left: 0, top: 0 })
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect()
      const size = box.current?.getBoundingClientRect()
      if (!r || !size) return
      const p = flat
        ? placeInWindow({ x: r.left, y: r.bottom + GAP }, size, { width: window.innerWidth, height: window.innerHeight }, { y: r.top - GAP - size.height })
        : placeInWindow({ x: r.right + GAP, y: r.top }, size, { width: window.innerWidth, height: window.innerHeight }, { x: r.left - GAP - size.width })
      setAt({ left: p.x, top: p.y })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, box, flat])
  return createPortal(
    <div ref={box} role="dialog" aria-label={label} className="panel fixed z-50 flex w-max flex-col gap-1.5 p-2" style={at}>
      <h3 className="text-label font-semibold text-ink">{label}</h3>
      <View />
    </div>,
    document.body,
  )
}

/** A group's ▾ and, while `open`, its panel. `onToggle` asks the strip to open it (closing any other) or close it. */
export function GroupOptions({ group, name, open, flat, onToggle }: { group: ToolGroup; name: string; open: boolean; flat: boolean; onToggle(): void }) {
  const entry = GROUP_OPTIONS[group]
  const root = useRef<HTMLSpanElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    if (open) onToggle()
  }, [open, onToggle])
  useCloseOutside(open, close, root, box)
  if (!entry) return null
  const title = `${name} options: ${entry.label.toLowerCase()}`
  return (
    <span ref={root} className={`flex shrink-0 ${flat ? '' : 'justify-center'}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${name} options`}
        title={title}
        onClick={onToggle}
        className={`pressable grid shrink-0 place-items-center rounded-control text-ink-tertiary hover:bg-hover hover:text-ink ${flat ? 'h-[2rem] w-4' : 'h-4 w-[2rem]'} ${open ? 'bg-fill text-ink' : ''}`}
      >
        <Icon name={flat ? 'chevronDown' : 'chevronRight'} className="h-3 w-3" />
      </button>
      {open && <Panel label={entry.label} view={entry.View} anchor={root} flat={flat} box={box} />}
    </span>
  )
}
