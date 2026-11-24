// The handles of a picked street or existing street (Phase PE.1 task 10, Decision "Path engine"): one set for both, read through
// `actions.pathOf`. A dot on each node (`data-path-node`: dragged, the street follows, snapped as a drawn point; clicked, picked, Delete or
// a double click removes it, its two stretches merging) and a diamond at the middle of each stretch's drawn line (`data-path-stretch`:
// dragged, the stretch moves anywhere, its neighbours stretching; a double click adds a node there). A number typed after a drag sets it
// exactly (`drags.ts`). A pill on each side of each stretch (`data-path-side`, `data-side`; a side at 0 has one on the drawn line): pulled, only that side
// moves; Shift, that side of the whole street; Ctrl frees the 0.5 m step. A transparent 8 px hit stroke over each lane line of each stretch whose narrowest lane is at least 24 px on the screen, so at plan zoom the body drags the street (`data-path-line`, `data-line`, Phase PE.2): dragged, the lanes beside it change; Shift: on every stretch that has the line. A lane pill at 0.7 along each free stretch of 80 px or more (`data-path-lanes`: `data-lane-take`, `data-lane-add`, Phase PE.2): clicks, not drags; Shift: every stretch. Hidden, or with every stretch locked: no handles. A locked stretch's diamond, pills and the nodes it holds start nothing. The dots are drawn last, over the pills.
import { useMemo } from 'react'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { lanesOf } from '../../../engine/path/lanes.ts'
import { kindOf } from '../../../kinds/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { isObjectHidden, isStreetHidden } from '../../layers/keys.ts'
import { useHiddenSet } from '../../layers/layerView.ts'
import { segmentsOfStreet } from '../../plan/circulation/roadState.ts'
import type { Drag } from '../../plan/useDrag.ts'
import { useShown } from '../../viewport/look.ts'
import type { Point } from '../../../model/schema.ts'
import { insertPathNode, lanePill, sidePill, startPathLine, startPathNode, startPathSide, startPathStretch } from './drags.ts'
import type { PathHost } from './host.ts'
import { lanesName, lineName, pathName } from './labels.ts'
import { pathKey, removePathNode, stepLanes, usePathPick, usePathRef } from './pathState.ts'

const HANDLE_PX = 9
/** px: a stretch shorter than this on the screen has no lane pill. */
const LANE_PILL_PX = 80
/** px: a stretch whose narrowest lane is narrower than this on the screen has no lane-line hit strokes (they would cover the whole body, and the street could not be dragged); the pill and typed values edit its lanes. */
const LANE_LINE_PX = 24
/** px: the width of a lane line's hit stroke. */
const LANE_LINE_HIT_PX = 8

/** The stretches that show a lane pill: the free ones at least `LANE_PILL_PX` long on the screen, else the longest free one; none for a kind with no lanes. */
function lanePillStretches(read: NonNullable<ReturnType<typeof actions.pathOf>>, scale: number, lanes: boolean): number[] {
  if (!lanes) return []
  const length = (k: number) => Math.hypot(read.path.points[k + 1].x - read.path.points[k].x, read.path.points[k + 1].y - read.path.points[k].y) * scale
  const free = read.path.stretches.map((_, k) => k).filter((k) => !read.held[k] && read.path.points[k + 1])
  const long = free.filter((k) => length(k) >= LANE_PILL_PX)
  if (long.length > 0 || free.length === 0) return long
  return [free.reduce((best, k) => (length(k) > length(best) ? k : best))]
}

export function PathHandles({ px, drag, scale, toWorld }: { px: number; drag: Drag; scale: number; toWorld: PathHost['toWorld'] }) {
  const project = useShown((s) => s.project)
  const roads = useShown((s) => s.derived.circulation.roads)
  const option = useApp((s) => s.option)
  const off = useHiddenSet()
  const pickKey = usePathPick((s) => s.key)
  const pickNode = usePathPick((s) => s.node)
  const ref = usePathRef()
  const read = useMemo(() => (ref ? actions.pathOf(project, ref, option) : null), [project, option, ref?.kind, ref?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ref || !read) return null
  const hidden = ref.kind === 'street' ? isStreetHidden(off, segmentsOfStreet(roads, ref.id)) : isObjectHidden(off, 'existing-road', ref.id)
  if (hidden || read.held.every(Boolean)) return null
  const laneWidth = standardsOf(project, project.options.find((o) => o.id === option)).laneWidth
  const host: PathHost = { drag, scale, toWorld }
  const key = pathKey(ref)
  const picked = pickKey === key ? pickNode : null
  const h = (HANDLE_PX / 2) * px
  const dots = read.path.points.map((q, i) => {
    const id = read.nodes[i]
    return (
      <circle
        key={`node-${i}`}
        data-path-node={id}
        data-picked={id === picked ? 'true' : undefined}
        cx={q.x}
        cy={-q.y}
        r={h}
        fill={id === picked ? 'var(--ink)' : 'var(--panel)'}
        stroke="var(--ink)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'move', touchAction: 'none' }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          removePathNode(ref, id)
        }}
        {...drag.bind(`path-node-${key}-${i}`, startPathNode(ref, i, host))}
      />
    )
  })
  const diamonds = read.path.points.slice(0, -1).map((a, k) => {
    const b = read.path.points[k + 1]
    const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const d = h * 1.15
    return (
      <polygon
        key={`stretch-${k}`}
        data-path-stretch={k}
        data-x={mid.x}
        data-y={mid.y}
        points={`${mid.x},${-mid.y - d} ${mid.x + d},${-mid.y} ${mid.x},${-mid.y + d} ${mid.x - d},${-mid.y}`}
        fill="var(--panel)"
        stroke="var(--ink)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'move', touchAction: 'none' }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          insertPathNode(ref, k, mid)
        }}
        {...drag.bind(`path-stretch-${key}-${k}`, startPathStretch(ref, k, host))}
      />
    )
  })
  const pills = read.path.stretches.flatMap((_, k) =>
    (['left', 'right'] as const).map((side) => {
      const at = sidePill(read.path, k, side)
      if (!at) return null
      const a = read.path.points[k]
      const b = read.path.points[k + 1]
      const deg = (-Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      const w = h * 1.7
      const t = h * 0.8
      return (
        <rect
          key={`side-${k}-${side}`}
          data-path-side={k}
          data-side={side}
          data-x={at.x}
          data-y={at.y}
          aria-label={`${pathName(ref)} width, ${side} side`}
          x={at.x - w}
          y={-at.y - t}
          width={2 * w}
          height={2 * t}
          rx={t}
          transform={`rotate(${deg} ${at.x} ${-at.y})`}
          fill="var(--panel)"
          stroke="var(--ink)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move', touchAction: 'none' }}
          {...drag.bind(`path-side-${key}-${k}-${side}`, startPathSide(ref, k, side, host))}
        />
      )
    }),
  )
  // the lane pill (Phase PE.2): `− 3 lanes +` on each free stretch long enough to hold it (the longest free one when none is)
  const lanePills = lanePillStretches(read, scale, kindOf(ref.kind, project)?.path?.lanes === true).map((k) => {
    const at = lanePill(read.path, k)
    if (!at) return null
    const n = lanesOf(read.path.stretches[k], laneWidth).length
    const bw = 16 * px
    const lw = 46 * px // room for "6 lanes" at 10.5 px between the buttons
    const hh = 9 * px
    const x0 = at.x - lw / 2 - bw
    const button = (kind: 'take' | 'add', x: number, label: string, title: string, dim: boolean) => (
      <g key={kind} data-lane-button={kind}>
        <rect
          {...{ [`data-lane-${kind}`]: '' }}
          role="button"
          aria-label={title}
          x={x}
          y={-at.y - hh}
          width={bw}
          height={2 * hh}
          rx={hh * 0.6}
          fill="var(--panel)"
          stroke="var(--ink)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          opacity={dim ? 0.5 : 1}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            stepLanes(ref, k, kind === 'add' ? 1 : -1, e.shiftKey)
          }}
        >
          <title>{`${title} (Shift: on every stretch)`}</title>
        </rect>
        <text x={x + bw / 2} y={-at.y} fontSize={12 * px} textAnchor="middle" dominantBaseline="central" fill="var(--ink)" pointerEvents="none">
          {label}
        </text>
      </g>
    )
    return (
      <g
        key={`lanes-${k}`}
        data-path-lanes={k}
        data-x={at.x}
        data-y={at.y}
        aria-label={lanesName(ref, k)}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {button('take', x0, '−', 'Take a lane', n <= 1)}
        <rect x={x0 + bw} y={-at.y - hh} width={lw} height={2 * hh} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <text x={at.x} y={-at.y} fontSize={10.5 * px} textAnchor="middle" dominantBaseline="central" fill="var(--ink)" pointerEvents="none">
          {n === 1 ? '1 lane' : `${n} lanes`}
        </text>
        {button('add', x0 + bw + lw, '+', 'Add a lane', false)}
      </g>
    )
  })
  // the lane lines (Phase PE.2): a transparent stroke 8 px wide over each, the line `j` standing `left − (the lanes before it)` m left of the stretch's drawn line
  const laneHits = kindOf(ref.kind, project)?.path?.lanes === true
    ? read.path.stretches.flatMap((st, k) => {
        const a = read.path.points[k]
        const b = read.path.points[k + 1]
        if (!a || !b) return []
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len < 1e-9) return []
        const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
        const lanes = lanesOf(st, laneWidth)
        if (Math.min(...lanes) * scale < LANE_LINE_PX) return []
        let cum = 0
        return lanes.slice(0, -1).map((lane, j) => {
          cum += lane
          const d = st.left - cum
          const p = { x: a.x + n.x * d, y: a.y + n.y * d }
          const q = { x: b.x + n.x * d, y: b.y + n.y * d }
          const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
          return (
            <line
              key={`line-${k}-${j}`}
              data-path-line={k}
              data-line={j}
              data-x={mid.x}
              data-y={mid.y}
              aria-label={lineName(ref, k, j)}
              x1={p.x}
              y1={-p.y}
              x2={q.x}
              y2={-q.y}
              stroke="transparent"
              strokeWidth={LANE_LINE_HIT_PX}
              vectorEffect="non-scaling-stroke"
              pointerEvents="stroke"
              style={{ cursor: 'move', touchAction: 'none' }}
              {...drag.bind(`path-line-${key}-${k}-${j}`, startPathLine(ref, k, j, host))}
            />
          )
        })
      })
    : []
  return (
    <g data-layer="path-handles">
      {laneHits}
      {diamonds}
      {pills}
      {lanePills}
      {dots}
    </g>
  )
}
