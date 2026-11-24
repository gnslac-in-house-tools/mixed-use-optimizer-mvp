// A picked street in Properties (Decision "Streets layout"): its type (the project's street types; Brief › Circulation
// edits them), its width and its lanes (read-outs: the pills and the lane lines set them, Decisions "Width by hand", "Path engine"), who drives it, its length
// and, on ground, its grading; its car
// stalls with those Shift+clicked beside it (modules/parking, Decision "Street parking by side"); each end connected
// to a parking lot, with Disconnect (Decision "Streets follow their lots"). A node picked on it (its handle clicked)
// is named, and Delete removes it: the street goes on past it where it can. A locked street (all its segments locked: the padlock is CAD's) shows every field
// read-only with the reason; one with only some segments locked is *mixed*: an edit changes its free segments and leaves the locked ones as they are.
import { titleWith } from '../commands/shortcuts.ts'
import { segmentLocked, streetLockState } from '../../kinds/locked.ts'
import type { DerivedRoad } from '../../engine/types.ts'
import { streetTypesOf } from '../../engine/circulation/streets.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { lockedFirst } from '../layers/locks.ts'
import { Button, SelectField } from '../controls/fields.tsx'
import { StreetParkingSection } from '../../modules/parking/views/StreetParking.tsx'
import { pickStreet, removeRoad } from '../plan/circulation/roadCommands.ts'
import { runsOf, streetIdOf, useRoads } from '../plan/circulation/roadState.ts'
import { Lockable } from './Lockable.tsx'
import { lanesOf } from '../../engine/path/lanes.ts'
import { lanesRead, sidesRead } from './sidesRead.ts'

const VEHICLES: Record<string, string> = { trucks: 'Trucks', cars: 'Cars', all: 'Trucks and cars' }
const pct = (v: number) => `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} %`
const m3 = (v: number) => Math.round(v).toLocaleString('en-US')

export function StreetProperties({ road, muted }: { road: DerivedRoad; muted: string }) {
  const option = useApp((s) => s.option)
  const apply = useApp((s) => s.apply)
  // the standards, not the types: a list made anew on each read would never settle
  const standards = useApp((s) => s.project.standards)
  const own = useApp((s) => s.project.options.find((o) => o.id === s.option)?.standards)
  const types = streetTypesOf({ standards }, { standards: own })
  const profiles = useApp((s) => s.derived.roadGrading?.roads)
  const maxGrade = useApp((s) => standardsOf(s.project).maxGrade)
  const laneWidth = useApp((s) => standardsOf(s.project, s.project.options.find((o) => o.id === s.option)).laneWidth)
  const here = useApp((s) => s.project.options.find((o) => o.id === s.option))
  const project = useApp((s) => s.project)
  // the street is every run of it (where its width changes it is several): what is read and set is all of them
  const allRoads = useApp((s) => s.derived.circulation.roads)
  const runs = runsOf(allRoads, streetIdOf(road))
  const segments = runs.flatMap((r) => r.segments ?? [])
  // the grading of every run of it: the steepest grade, the cut and the fill added
  const gradedRuns = profiles?.filter((g) => runs.some((r) => r.id === g.roadId)) ?? []
  const graded = gradedRuns.length
    ? { grade: Math.max(...gradedRuns.map((g) => g.grade)), cut: gradedRuns.reduce((n, g) => n + g.cut, 0), fill: gradedRuns.reduce((n, g) => n + g.fill, 0) }
    : null
  // its width, read along the street (a run can be stored the other way: the path engine turns its sides)
  const widthOf = actions.pathOf(project, { kind: 'street', id: streetIdOf(road) }, option)?.path.stretches ?? []
  const nodes = [...new Set(runs.flatMap((r) => r.nodes ?? []))]
  // the padlock: its segments' (all: locked, read-only; some: mixed, an edit changes the free ones only)
  const lockState = streetLockState(project, option, segments)
  const free = segments.filter((id) => !segmentLocked(project, option, id))
  // its ends connected to a lot (Decision "Streets follow their lots"), with the lot's name
  const connected = nodes.flatMap((id) => {
    const n = here?.streets?.nodes.find((x) => x.id === id)
    const lot = n?.lot && here?.lots?.find((l) => l.id === n.lot)
    return n && lot ? [{ node: n.id, name: lot.name }] : []
  })
  const node = useRoads((s) => s.node)
  const nodeHere = node !== null && nodes.includes(node)
  const type = types.find((t) => t.id === road.streetType) ?? types[0]
  const length = runs.reduce((sum, r) => {
    const corners = r.nodePoints ?? r.points
    return sum + corners.slice(1).reduce((n, b, i) => n + Math.hypot(b.x - corners[i].x, b.y - corners[i].y), 0)
  }, 0)
  const row = (label: string, value: string, extra = '') => (
    <div className="flex justify-between gap-3 text-body">
      <span className={`text-label ${muted}`}>{label}</span>
      <span className={`select-text text-right font-medium tabular-nums ${extra}`}>{value}</span>
    </div>
  )

  return (
    <Lockable locked={lockState === 'locked'} muted={muted}>
      {lockState === 'mixed' && <p className={`select-text text-caption ${muted}`}>Some of its segments are locked: an edit changes the others.</p>}
      <SelectField
        label="Type"
        value={type.id}
        options={types.map((t) => ({ value: t.id, label: `${t.name} · ${t.width} m` }))}
        onCommit={(v) => {
          const seg = road.segments?.[0]
          apply((p) => actions.setStreetSegmentType(p, option, free, v))
          pickStreet(seg)
        }}
      />
      {row('Width', sidesRead(widthOf))}
      {row('Lanes', lanesRead(widthOf.map((st) => lanesOf(st, laneWidth))))}
      {row('For', `${VEHICLES[road.vehicles] ?? road.vehicles}${road.vehicles !== type.vehicles ? ' (its own)' : ''}`)}
      {row('Turning radius', `${road.radius ?? type.radius} m${(road.radius ?? type.radius) !== type.radius ? ' (its own)' : ''}`)}
      {row('Length', `${Math.round(length).toLocaleString('en-US')} m`)}
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
      {connected.map((c) => (
        <div key={c.node} className="flex items-center justify-between gap-3 text-body">
          <span>Connected to {c.name}</span>
          <Button title={`Let go of ${c.name}: the end stays where it is, the lot moves without it`} onClick={() => apply((p) => actions.disconnectStreetEnd(p, option, c.node))}>
            Disconnect
          </Button>
        </div>
      ))}
      <StreetParkingSection road={road} muted={muted} />
      <p className={`select-text text-caption ${muted}`}>
        {nodeHere
          ? 'A node picked: drag it, or Delete it (the street goes on past it where it can).'
          : 'Drawn by you: drag it, or its nodes; a double click on it adds a node. The types are the Brief’s (Circulation).'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button title={lockState === 'locked' ? lockedFirst(1, 'street') : titleWith(nodeHere ? 'Delete the node' : 'Delete the street', 'edit.delete')} onClick={() => removeRoad(road)}>
          {nodeHere ? 'Delete node' : 'Delete'}
        </Button>
      </div>
    </Lockable>
  )
}
