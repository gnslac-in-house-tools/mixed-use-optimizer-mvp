// An existing road picked (in Layers, or on the plan) in Properties (Phase AS.3, Decision "Settings by what is picked"): its name,
// its width and its lanes (read-outs: the pills and the lane lines set them, Decision "Width by hand"), its length, and Delete. A locked one (Phase PE.2, the padlock is CAD's) shows them read-only (`Lockable`). `ExistingRoadFields` is the same field the Site tab's Access section showed under a
// picked row. Every field sends a verb through `actions` (one undo step each).
import type { Id } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { Button, TextField } from '../controls/fields.tsx'
import { useRenameField } from '../editing/rename.ts'
import { existingRoadLocked } from '../../kinds/locked.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { gatesOnRoads, tellGatesWent } from '../plan/access/accessCommands.ts'
import { lockedFirst } from '../layers/locks.ts'
import { Lockable } from './Lockable.tsx'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { lanesOf } from '../../engine/path/lanes.ts'
import { lanesRead, sidesRead } from './sidesRead.ts'

/** The road's name as the lists say it: its own, or its number. */
export const existingRoadName = (name: string | undefined, index: number): string => name ?? `Existing road ${index + 1}`

/** The road's field: Name. The name answers Rename (F2: `editing/rename.ts`) unless `answersRename` is off (the card over the viewport leaves it to the panel's). */
export function ExistingRoadFields({ id, answersRename = true }: { id: Id; answersRename?: boolean }) {
  const road = useApp((s) => s.project.site.existingRoads?.find((r) => r.id === id))
  const index = useApp((s) => s.project.site.existingRoads?.findIndex((r) => r.id === id) ?? -1)
  const apply = useApp((s) => s.apply)
  const nameField = useRenameField('existing-road', id, answersRename)
  if (!road) return null
  return (
    <>
      <TextField key={id} label="Name" inputRef={nameField} value={existingRoadName(road.name, index)} onCommit={(v) => apply((p) => actions.updateExistingRoad(p, id, { name: v }))} />
    </>
  )
}

export function ExistingRoadProperties({ id, muted, answersRename = true }: { id: Id; muted: string; answersRename?: boolean }) {
  const road = useApp((s) => s.project.site.existingRoads?.find((r) => r.id === id))
  const index = useApp((s) => s.project.site.existingRoads?.findIndex((r) => r.id === id) ?? -1)
  const apply = useApp((s) => s.apply)
  const laneWidth = useApp((s) => standardsOf(s.project, s.project.options.find((o) => o.id === s.option)).laneWidth)
  const locked = useApp((s) => existingRoadLocked(s.project, id))
  if (!road) return null
  const name = existingRoadName(road.name, index)
  const length = road.points.slice(1).reduce((n, q, k) => n + Math.hypot(q.x - road.points[k].x, q.y - road.points[k].y), 0)
  return (
    <section aria-label={name} className="flex flex-col gap-3">
      <h2 className="truncate text-headline">{name}</h2>
      <p className={`select-text text-caption ${muted}`}>A road already in the parcel, {Math.round(length).toLocaleString('en-US')} m long: the site’s, not the design’s.</p>
      <Lockable locked={locked} muted={muted}>
        <ExistingRoadFields id={id} answersRename={answersRename} />
        <div className="flex justify-between gap-3 text-body">
          <span className={`text-label ${muted}`}>Width</span>
          <span className="select-text text-right font-medium tabular-nums">{sidesRead(road.stretches)}</span>
        </div>
        <div className="flex justify-between gap-3 text-body">
          <span className={`text-label ${muted}`}>Lanes</span>
          <span className="select-text text-right font-medium tabular-nums">{lanesRead(road.stretches.map((st) => lanesOf(st, laneWidth)))}</span>
        </div>
        <div>
          <Button
            title={locked ? lockedFirst(1, 'existing-road') : `Delete ${name}`}
            onClick={() => {
              // the gates standing on it go with it: asked before, said after
              let gates: Id[] = []
              apply((p) => {
                gates = gatesOnRoads(p, useApp.getState().option, [id])
                return actions.removeExistingRoad(p, id)
              })
              tellGatesWent(gates)
              useAccess.getState().pick(null)
            }}
          >
            Delete
          </Button>
        </div>
      </Lockable>
    </section>
  )
}
