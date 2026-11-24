// A program's look on the plan (Decision "Plan style"; the user: "customize them per program, with each one's colour,
// or give the hatch by default"): its swatch in the Brief opens a box with the colours (PROGRAM_COLORS) and the hatches,
// each shown on its colour. Without a pick, the hatch is the default (built: diagonal, open: paving); *Default* goes
// back to it. Every pick is one undo step (updateProgram).
import { useCallback, useId, useRef, useState } from 'react'
import { HATCHES, type Hatch, type Program } from '../../model/schema.ts'
import { PROGRAM_COLORS } from '../../model/buildingColors.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { useCloseOutside } from '../controls/useCloseOutside.ts'
import { defaultHatch, HATCH_LABELS, HatchSwatch } from '../plan/hatches.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** The box's width (px): it opens under the swatch, inside the window. */
const BOX_W = 256

export function ProgramStyle({ program }: { program: Program }) {
  // where the box stands, fixed to the window (the Brief's table scrolls sideways and would clip it); null: closed
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const open = at !== null
  const close = useCallback(() => setAt(null), [])
  const root = useRef<HTMLSpanElement>(null)
  useCloseOutside(open, close, root)
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const hatch = program.hatch ?? defaultHatch(program)
  const update = (patch: Partial<Pick<Program, 'color' | 'hatch'>>) => useApp.getState().apply((p) => actions.updateProgram(p, program.id, patch))
  const colors = [...new Set([program.color, ...PROGRAM_COLORS])]

  return (
    <span ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Colour and hatch of ${program.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={tr("Its colour and hatch on the plan")}
        onClick={(e) => {
          if (open) return close()
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - BOX_W - 8)), top: r.bottom + 4 })
        }}
        className="pressable grid h-6 w-6 place-items-center rounded-control hover:bg-hover"
      >
        <HatchSwatch color={program.color} hatch={hatch} size={14} id={`${id}b`} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${program.name} on the plan`}
          className="panel fixed z-50 flex select-text flex-col gap-3 p-3 shadow-sheet"
          style={{ left: at.left, top: at.top, width: BOX_W }}
        >
          <section className="flex flex-col gap-1.5">
            <h3 className="text-label text-ink-secondary">{tr("Colour")}</h3>
            <div role="group" aria-label="Colour" className="grid grid-cols-8 gap-1">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={c.toLowerCase() === program.color.toLowerCase()}
                  onClick={() => update({ color: c })}
                  className="pressable h-6 w-6 rounded-[5px] ring-ink ring-offset-1 ring-offset-panel aria-pressed:ring-2"
                  style={{ background: c }}
                />
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-label text-ink-secondary">{tr("Hatch")}</h3>
              {program.hatch !== undefined && (
                <button
                  type="button"
                  title={`Back to the default: ${HATCH_LABELS[defaultHatch(program)]} (${program.built ? 'built' : 'open ground'})`}
                  onClick={() => update({ hatch: undefined })}
                  className="pressable rounded-control text-caption text-ink-secondary underline underline-offset-2 hover:text-ink"
                >
                  {tr("Default")}
                </button>
              )}
            </div>
            <div role="group" aria-label="Hatch" className="grid grid-cols-3 gap-1">
              {HATCHES.map((h: Hatch) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={h === hatch}
                  title={program.hatch === undefined && h === hatch ? `${HATCH_LABELS[h]} (the default)` : HATCH_LABELS[h]}
                  onClick={() => update({ hatch: h })}
                  className="pressable flex flex-col items-center gap-1 rounded-control p-1.5 text-caption text-ink-secondary hover:bg-hover aria-pressed:bg-fill aria-pressed:text-ink"
                >
                  <HatchSwatch color={program.color} hatch={h} size={40} id={`${id}${h}`} />
                  {HATCH_LABELS[h]}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </span>
  )
}

