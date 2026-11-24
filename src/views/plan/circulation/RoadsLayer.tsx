// The option's roads on the Flow plan (Decision "Exterior circulation", 4.4–4.5), over the truck courts and under the
// masses: the one paving of every road shown, streets and existing roads (joinedPaving, Phase PE.1), each axis cut where another road's
// paving is (axesOf: a street's dashed, an existing one's dash-dot), under them the lane lines (Phase PE.2: one dashed path a road, `--road-lane`, none for one lane); a transparent stroke over each road, street or
// existing street, takes the press (Phase PE.2 task 12: an existing street is picked here, `data-road-kind="existing"`, its pick the access store's). A click picks a street (Properties shows it; Delete removes it;
// Shift+click adds another, Decision "Street parking by side");
// the picked one has an ink edge; dragged, it moves (Decision "Streets layout"), Alt+drag copies it, an existing street too (`startRoadDrag`); a double click on a street adds a node;
// The picked street's handles (nodes, stretches, side pills) are `views/editing/path/`. StallsLayer: the car stalls along the roads.
// Hidden (views/layers): Streets takes the paving, the centrelines, the picks and the handles off the plan, and so does a street whose segments' own keys
// are all hidden (Hide for one object); Street parking the stalls, and those along a hidden street; what they hold is still counted.
// Locked (Phase AS.4, Decision "Padlocks by kind"; the padlock is CAD's): a street with all its segments locked is seen with the lock's glyph at its middle and answers
// no press (it has no drag, its press is the background's, which says it is locked) nor handles; one with only some segments locked is *mixed*: picked and
// dragged by its free segments, a glyph on each locked one, whose handle, nodes and width start nothing. A locked existing street is seen with the glyph at its middle and answers no press.
import { useMemo } from 'react'
import { existingRoadLocked, segmentLocked, streetLockState } from '../../../kinds/locked.ts'
import { axesOf, joinedPaving } from '../../../engine/path/join.ts'
import { laneLines } from '../../../engine/path/lanes.ts'
import type { DerivedRoad } from '../../../engine/types.ts'
import type { Id, Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { roadHidden, shownStalls } from '../../layers/keys.ts'
import { useHiddenSet } from '../../layers/layerView.ts'
import { useShown } from '../../viewport/look.ts'
import { usePickedRefs } from '../mix.ts'
import { pathOf } from '../camera.ts'
import { LockGlyph } from '../LockGlyph.tsx'
import type { Drag } from '../useDrag.ts'
import { streetIdOf, useRoads } from './roadState.ts'
import { roadName, splitStreetAt, startRoadDrag } from './roadCommands.ts'


const line = (pts: Point[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${-q.y}`).join('')

/** Where a locked street's glyph stands: the middle of its centreline. */
const middleOf = (points: Point[]): Point => points[Math.floor((points.length - 1) / 2)]

/** The glyphs of a street's padlock: one at its middle when all its segments are locked, one on each locked segment of a mixed street (at the middle of its two nodes). */
function streetGlyphs(r: DerivedRoad, state: 'locked' | 'mixed', px: number, locked: (seg: Id) => boolean) {
  if (state === 'locked')
    return [
      <g key={r.id} data-lock={r.id}>
        <LockGlyph at={middleOf(r.points)} px={px} size={11} />
      </g>,
    ]
  return (r.segments ?? []).flatMap((id, i) => {
    const a = r.nodePoints?.[i]
    const b = r.nodePoints?.[i + 1]
    if (!a || !b || !locked(id)) return []
    return [
      <g key={id} data-lock={id}>
        <LockGlyph at={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }} px={px} size={11} />
      </g>,
    ]
  })
}

export function RoadsLayer({ px, interactive, drag, toWorld }: { px: number; interactive: boolean; drag: Drag; toWorld?: (e: { clientX: number; clientY: number }) => Point }) {
  const roads = useShown((s) => s.derived.circulation.roads)
  const project = useShown((s) => s.project)
  const option = useApp((s) => s.option)
  const picked = useRoads((s) => s.picked)
  const also = useRoads((s) => s.also)
  // the existing streets picked (the bridge says: the access store holds them beside the gates)
  const refs = usePickedRefs()
  const sites = useMemo(() => refs.filter((r) => r.kind === 'existing-road').map((r) => r.id), [refs])
  const off = useHiddenSet()
  // what an eye hides is not drawn, picked or dragged
  const shown = useMemo(() => roads.filter((r) => !roadHidden(off, r)), [roads, off])
  // the one paving of every road shown, existing and created (Phase PE.1): the union, so streets that meet are one surface
  const paving = useMemo(() => joinedPaving(shown.map((r) => ({ points: r.points, width: r.width, radius: r.radius }))), [shown])
  const axes = useMemo(() => axesOf(shown.map((r) => ({ points: r.points, width: r.width, radius: r.radius }))), [shown])
  // the lines between lanes (Phase PE.2): each road's axis (cut where another road's paving is) shifted to every divider; one lane has none
  const dividers = useMemo(
    () => shown.map((r, i) => (r.lanes && r.lanes.length > 1 && r.left !== undefined && r.right !== undefined ? axes[i].flatMap((piece) => laneLines(piece, r.left!, r.right!, r.lanes!)) : [])),
    [shown, axes],
  )
  if (shown.length === 0) return null
  // the padlock: all the segments locked, some (mixed), none
  const stateOf = (r: DerivedRoad) => (r.kind === 'existing' ? (existingRoadLocked(project, r.sourceId ?? r.id) ? 'locked' : 'unlocked') : r.segments ? streetLockState(project, option, r.segments) : 'unlocked')
  return (
    <g data-layer="roads">
      {/* the picked streets' edge (the one, and those Shift+clicked beside it), and the picked existing streets', under the paving */}
      {shown
        .filter((r) => (r.kind === 'street' && (streetIdOf(r) === picked || also.includes(streetIdOf(r)))) || (r.kind === 'existing' && sites.includes(r.sourceId ?? r.id)))
        .map((r) => (
          <path key={`edge-${r.id}`} d={line(r.points)} fill="none" stroke="var(--ink)" strokeWidth={r.width + 4 * px} strokeLinecap="butt" strokeLinejoin="round" pointerEvents="none" />
        ))}
      {/* the one paving: the union of the roads shown; it answers no pointer, the hit strokes over it do */}
      <path data-paving="" d={pathOf(paving.flat())} fill="var(--road)" fillRule="evenodd" stroke="none" pointerEvents="none" />
      {/* the existing streets' hit strokes, under the streets' (a street that ends on one answers first) */}
      {shown
        .filter((r) => r.kind === 'existing')
        .map((r) => (
          <g key={r.id} data-existing-road={r.sourceId ?? r.id}>
            <path
              d={line(r.points)}
              data-road={r.id}
              data-street-id={streetIdOf(r)}
              data-road-kind={r.kind}
              aria-label={roadName(r)}
              fill="none"
              stroke="transparent"
              strokeWidth={r.width}
              strokeLinejoin="round"
              {...(interactive && stateOf(r) === 'locked'
                ? // locked: seen, not picked or dragged: its press is the background's, which says so
                  { style: { cursor: 'default' } }
                : interactive
                ? { ...drag.bind(`road-${r.id}`, startRoadDrag(r.id, 1 / px)), style: { cursor: drag.key === `road-${r.id}` ? 'grabbing' : 'pointer' } }
                : { pointerEvents: 'none' as const })}
            />
          </g>
        ))}
      {shown
        .filter((r) => r.kind === 'street')
        .map((r) => (
          <path
            key={r.id}
            d={line(r.points)}
            data-road={r.id}
            data-street-id={streetIdOf(r)}
            data-road-kind={r.kind}
            aria-label={roadName(r)}
            fill="none"
            stroke="transparent"
            strokeWidth={r.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...(interactive && stateOf(r) === 'locked'
              ? // locked: seen, not dragged: its press is the background's, which says so
                { style: { cursor: 'default' } }
              : interactive
              ? {
                  ...drag.bind(`road-${r.id}`, startRoadDrag(r.id, 1 / px)),
                  ...(toWorld
                    ? {
                        onDoubleClick: (e: { clientX: number; clientY: number; stopPropagation(): void }) => {
                          e.stopPropagation()
                          splitStreetAt(r, toWorld(e))
                        },
                      }
                    : {}),
                  style: { cursor: drag.key === `road-${r.id}` ? 'grabbing' : 'pointer' },
                }
              : { pointerEvents: 'none' as const })}
          />
        ))}
      {/* the lane lines: under the axes, quiet; none for a road of one lane */}
      <g data-lanes="" pointerEvents="none">
        {shown.flatMap((r, i) =>
          dividers[i].length === 0
            ? []
            : [<path key={`lanes-${r.id}`} data-lane-lines={r.id} d={dividers[i].map(line).join('')} fill="none" stroke="var(--road-lane)" strokeWidth={1} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />],
        )}
      </g>
      <g pointerEvents="none">
        {shown.flatMap((r, i) =>
          axes[i].map((pts, k) => (
            <path key={`axis-${r.id}-${k}`} data-axis={r.id} d={line(pts)} fill="none" stroke="var(--road-axis)" strokeWidth={1} strokeDasharray={r.kind === 'existing' ? '10 4 2 4' : '10 6'} vectorEffect="non-scaling-stroke" />
          )),
        )}
        {/* the lock: a glyph at the middle of a locked street, on each locked segment of a mixed one */}
        {shown.flatMap((r) => {
          const state = stateOf(r)
          return state === 'unlocked' ? [] : streetGlyphs(r, state, px, (seg) => segmentLocked(project, option, seg))
        })}
      </g>
    </g>
  )
}

/** The car stalls along the roads (4.6): paper with a fine ink line, as Practiko's stalls; one path, they are many. */
export function StallsLayer() {
  const circulation = useShown((s) => s.derived.circulation)
  const off = useHiddenSet()
  // the stalls along a hidden street go with it (they still count in the figures)
  const stalls = useMemo(() => shownStalls(circulation, off), [circulation, off])
  if (stalls.length === 0) return null
  return (
    <path
      data-layer="stalls"
      data-stalls={stalls.length}
      d={pathOf(stalls)}
      fill="var(--stall)"
      stroke="var(--road-axis)"
      strokeWidth={0.75}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  )
}
