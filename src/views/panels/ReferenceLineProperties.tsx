// A reference line picked (on the plan or in Layers), in Properties (Phase AS.5, Decision "Reference lines"): its name (*Reference line N*, its place among the project's), its
// length and how many points it has, *On top* (the kind's: the guides go over the model, as the Reference lines row's toggle says) and Delete. Its points are dragged on the plan, and
// adding or removing one comes with the path engine (project E). A locked line (the padlock is CAD's) is read-only and says so; *On top* is a view setting, so it stays.
import { referenceLineName } from '../../engine/annotations.ts'
import type { Id } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { Button, Total } from '../controls/fields.tsx'
import { Icon } from '../controls/Icon.tsx'
import { REFERENCE_LINES } from '../layers/keys.ts'
import { toggleOnTop, useOnTopSet } from '../layers/layerView.ts'
import { lockedFirst } from '../layers/locks.ts'
import { letGoKind } from '../plan/mix.ts'
import { Lockable } from './Lockable.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** Metres as the lists say them ("4 m", "12.5 m"). */
const metres = (v: number): string => `${Math.round(v * 100) / 100} m`

export function ReferenceLineProperties({ id, muted }: { id: Id; muted: string }) {
  const all = useApp((s) => s.project.referenceLines)
  const apply = useApp((s) => s.apply)
  const onTop = useOnTopSet().has(REFERENCE_LINES)
  const index = all?.findIndex((r) => r.id === id) ?? -1
  const line = all?.[index]
  if (!line) return null
  const name = referenceLineName(index)
  const length = line.points.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - line.points[i].x, q.y - line.points[i].y), 0)
  const locked = line.locked === true
  return (
    <section aria-label={name} className="flex flex-col gap-3">
      <h2 className="text-headline">{name}</h2>
      <p className={`select-text text-caption ${muted}`}>{tr("A guide: the other tools snap to it. It belongs to the project, so it is on every level and in every option. Drag its points on the plan to change it.")}</p>
      <Lockable locked={locked} muted={muted}>
        <dl aria-label="Figures" className="flex flex-col gap-1.5">
          <Total label="Length" value={metres(length)} />
          <Total label="Points" value={String(line.points.length)} />
        </dl>
      </Lockable>
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-ink-secondary">{tr("On top")}</span>
        <button
          type="button"
          aria-label="On top Reference lines"
          aria-pressed={onTop}
          title={tr("On top: the reference lines are drawn over the model")}
          onClick={() => toggleOnTop([REFERENCE_LINES])}
          className={`pressable grid h-6 w-6 place-items-center rounded-pill ${onTop ? 'bg-fill text-ink' : `hover:bg-hover hover:text-ink ${muted}`}`}
        >
          <Icon name="onTop" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div>
        <Button
          title={locked ? lockedFirst(1, 'reference-line') : `Delete ${name}`}
          disabled={locked}
          onClick={() => {
            apply((p) => actions.removeReferenceLine(p, id))
            letGoKind('reference-line')
          }}
        >
          {tr("Delete")}
        </Button>
      </div>
    </section>
  )
}
