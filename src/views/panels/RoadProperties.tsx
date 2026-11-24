// A picked road in Properties (Decision "Exterior circulation", 4.4–4.5): what it is, its width and length. A street
// (since ST.4 every road of the design is one) is StreetProperties'; an existing road is the parcel's (the Site step
// edits it). On ground, its grading (Decision "Graded roads"): its steepest grade against the max. road grade, its cut
// and fill.
import { standardsOf } from '../../engine/circulation/standards.ts'
import { useApp } from '../../state/store.ts'
import { Icon } from '../controls/Icon.tsx'
import { roadName } from '../plan/circulation/roadCommands.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { StreetProperties } from './StreetProperties.tsx'

const pct = (v: number) => `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} %`
const m3 = (v: number) => Math.round(v).toLocaleString('en-US')

export function RoadProperties({ id, muted }: { id: string; muted: string }) {
  const road = useApp((s) => s.derived.circulation.roads.find((r) => r.id === id))
  const graded = useApp((s) => s.derived.roadGrading?.roads.find((r) => r.roadId === id))
  const maxGrade = useApp((s) => standardsOf(s.project).maxGrade)
  if (!road) return null
  const length = road.points.slice(1).reduce((n, b, i) => n + Math.hypot(b.x - road.points[i].x, b.y - road.points[i].y), 0)

  return (
    <section aria-label="Road" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="road" className="h-4 w-4 shrink-0" />
          <span className="truncate text-headline">{roadName(road)}</span>
        </div>
        <button
          type="button"
          aria-label="Clear selection"
          title="Clear selection (Esc)"
          className={`pressable -mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-pill hover:bg-hover hover:text-ink ${muted}`}
          onClick={() => useRoads.getState().pick(null)}
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
      {road.kind === 'street' ? (
        <StreetProperties road={road} muted={muted} />
      ) : (
        <>
          <div className="flex justify-between gap-3 text-body">
            <span className={`text-label ${muted}`}>Width</span>
            <span className="select-text font-medium tabular-nums">{road.width} m</span>
          </div>
          <div className="flex justify-between gap-3 text-body">
            <span className={`text-label ${muted}`}>Length</span>
            <span className="select-text font-medium tabular-nums">{Math.round(length).toLocaleString('en-US')} m</span>
          </div>
          {graded && (
            <dl aria-label="Road grading" className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-body">
                <dt className={`text-label ${muted}`}>Steepest grade</dt>
                <dd className={`select-text font-medium tabular-nums ${graded.grade > maxGrade + 1e-6 ? 'text-status-over' : ''}`}>
                  {pct(graded.grade)} <span className={`font-normal ${muted}`}>of {pct(maxGrade)} max.</span>
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-body">
                <dt className={`text-label ${muted}`}>Cut · Fill</dt>
                <dd className="select-text font-medium tabular-nums">
                  ≈ {m3(graded.cut)} · {m3(graded.fill)} m³
                </dd>
              </div>
            </dl>
          )}
        </>
      )}
    </section>
  )
}
