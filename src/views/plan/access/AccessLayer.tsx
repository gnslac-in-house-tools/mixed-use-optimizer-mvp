// The site's access on the plan (Decision "Exterior circulation", 4.2), under the masses and over the roads (a gate stands on its host's edge, so its handle must not lie under the paving-wide hit strokes of the roads layer): each gate (its
// lane in, its opening, its guard house and its arrow: in, out or both; port of Plaza-Practiko's `CapaEntradas` and `dFlechaAcceso`). A
// street along the site is an existing street, drawn, picked and moved by the roads layer like any other (Phase PE.2: the frontage is gone; `circulation/RoadsLayer.tsx`). Where it is
// `interactive` it answers the pointer: a gate's square handle slides along its side, of a street or of the boundary (port of `ManijaRampa`; `startGateSlide`), a click picks a
// gate. Compare, which is not `interactive`, only draws it. Hidden (views/layers): Gates
// take theirs, and an object's own key that one: it is not drawn, picked or slid, and what it holds is still counted. A locked gate
// (Phase AS.4, Decision "Padlocks by kind"; the padlock is CAD's) is seen, with the lock's glyph beside its handle, and its handle
// slides nothing and answers no press (the plan's background says it is locked).
import { useMemo } from 'react'
import { gateLocked } from '../../../kinds/locked.ts'
import type { Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { isObjectHidden } from '../../layers/keys.ts'
import { useHiddenSet } from '../../layers/layerView.ts'
import { useShown } from '../../viewport/look.ts'
import { startGateSlide } from '../../editing/edge/gateSlide.ts'
import { pathOf } from '../camera.ts'
import { GATE_HIT_PX } from '../lockedAt.ts'
import { LockGlyph } from '../LockGlyph.tsx'
import type { Drag } from '../useDrag.ts'
import { useAccess } from './accessState.ts'
import { arrowPath } from './arrow.ts'

const HANDLE_PX = 12

const line = (pts: Point[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${-q.y}`).join('')

export function AccessLayer({ px, drag, interactive }: { px: number; drag: Drag; interactive: boolean }) {
  const circulation = useShown((s) => s.derived.circulation)
  const project = useShown((s) => s.project)
  const option = useApp((s) => s.option)
  const off = useHiddenSet()
  // what an eye hides is not drawn, picked or slid
  const c = useMemo(
    () => ({
      gates: circulation.gates.filter((g) => !isObjectHidden(off, 'gate', g.id)),
    }),
    [circulation, off],
  )
  const picked = useAccess((s) => s.picked)
  const alsoGates = useAccess((s) => s.alsoGates)
  const tool = useAccess((s) => s.tool)
  // a tool owns the presses; without one the access answers them
  const live = interactive && tool === null
  const isPicked = (kind: string, id: string) => picked?.kind === kind && picked.id === id

  return (
    <g data-layer="access">
      {/* the gates: the lane in, the opening's posts, the guard house, the arrow */}
      {c.gates.map((g, i) => {
        const on = isPicked('gate', g.id) || alsoGates.includes(g.id)
        const locked = gateLocked(project, option, g.id)
        const posts = 4 * px
        const post = (q: Point) => `M${q.x - g.inward.x * posts} ${-(q.y - g.inward.y * posts)}L${q.x + g.inward.x * posts} ${-(q.y + g.inward.y * posts)}`
        return (
          <g key={`gate-${g.id}`} data-gate={g.id} data-flow={g.flow} aria-label={`Gate ${i + 1}`} aria-selected={on}>
            <path d={pathOf([g.lane])} fill="var(--road)" stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {/* the opening: the lane's paving cuts the boundary's line, the posts stand at its ends */}
            <path d={line([g.a, g.b])} stroke="var(--road)" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <path d={`${post(g.a)}${post(g.b)}`} stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {g.guardHouse && <path data-guard-house="" d={pathOf([g.guardHouse])} fill="var(--ink)" fillOpacity={0.55} stroke="none" pointerEvents="none" />}
            <path data-arrow="" d={arrowPath(g.arrow.from, g.arrow.to, g.flow, 2.5)} fill="none" stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {/* locked: its handle is drawn and slides nothing; the lock stands beside it */}
            {locked && (
              <g data-lock={g.id}>
                <LockGlyph at={{ x: g.at.x + g.inward.x * 16 * px, y: g.at.y + g.inward.y * 16 * px }} px={px} size={11} />
              </g>
            )}
            {interactive && (
              <g
                {...(live && !locked ? drag.bind(`gate-${g.id}`, startGateSlide(g.id, 1 / px)) : locked ? {} : { pointerEvents: 'none' })}
                aria-label={locked ? `Gate ${i + 1}: locked` : `Gate ${i + 1}: drag it along its side`}
                style={{ cursor: locked ? 'default' : drag.key === `gate-${g.id}` ? 'grabbing' : 'grab', touchAction: 'none' }}
              >
                <circle cx={g.at.x} cy={-g.at.y} r={GATE_HIT_PX * px} fill="transparent" />
                <rect
                  x={g.at.x - (HANDLE_PX / 2) * px}
                  y={-g.at.y - (HANDLE_PX / 2) * px}
                  width={HANDLE_PX * px}
                  height={HANDLE_PX * px}
                  fill={on ? 'var(--ink)' : 'var(--panel)'}
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </g>
        )
      })}

    </g>
  )
}
