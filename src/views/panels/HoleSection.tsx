// A mass's holes in Properties (Phase H.4, Decision "Holes and free geometry"): each hole with its area and the width
// of the corridor round it (0 = none; Practiko's `pasilloDeHueco`), and Delete. The hole picked on the plan is marked;
// a click on a row picks it there.
import type { Id } from '../../model/schema.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { area } from '../../engine/geom/polygon.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { Button, NumberField } from '../controls/fields.tsx'
import { m2 } from '../format.ts'
import { useHoles } from '../plan/holeState.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const holeArea = (h: Parameters<typeof contourToPolygon>[0]) => {
  try {
    return area(contourToPolygon(h))
  } catch {
    return 0
  }
}

export function HoleSection({ id, locked, muted }: { id: Id; locked: boolean; muted: string }) {
  const holes = useApp((s) => s.project.masses.find((m) => m.id === id)?.holes)
  const corridors = useApp((s) => s.derived.masses[id]?.corridors)
  const apply = useApp((s) => s.apply)
  const pick = useHoles((s) => s.pick)
  const setPick = useHoles((s) => s.setPick)
  if (!holes?.length) return null

  return (
    <section aria-label="Holes" className="flex flex-col gap-2 border-t border-separator pt-3">
      <h3 className={`text-label ${muted}`}>{tr("Holes")}</h3>
      {holes.map((h, k) => {
        const picked = pick?.massId === id && pick.k === k
        const corridor = corridors?.find((c) => c.k === k)
        return (
          <div key={k} role="group" aria-label={`Hole ${k + 1}`} className={`flex flex-col gap-1.5 rounded-control p-1.5 ${picked ? 'bg-fill' : ''}`}>
            <button
              type="button"
              className="flex justify-between gap-3 text-left text-body"
              title="Pick it on the plan"
              aria-label={`Hole ${k + 1}, ${m2(holeArea(h))}`}
              onClick={() => setPick({ massId: id, k, vertex: null })}
            >
              <span className="font-medium">Hole {k + 1}</span>
              <span className="tabular-nums">{m2(holeArea(h))}</span>
            </button>
            <NumberField
              label="Corridor"
              unit="m"
              min={0}
              disabled={locked}
              value={h.corridor ?? 0}
              onCommit={(w) => apply((p) => actions.setHoleCorridor(p, id, k, w))}
            />
            {corridor && <p className={`select-text text-caption ${muted}`}>A corridor of {m2(corridor.area)} round it</p>}
            <div>
              <Button
                title="Delete this hole (Del, picked on the plan)"
                disabled={locked}
                onClick={() => {
                  apply((p) => actions.removeHole(p, id, k))
                  setPick(null)
                }}
              >
                {tr("Delete hole")}
              </Button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
