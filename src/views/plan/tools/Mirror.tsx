// The Tools strip's Mirror (key I: commands/tools.ts; Phase AS.5, Decision "Mirror, Array, Align"): whatever is picked is
// reflected about a line given by two clicks (`LineTool.tsx`). It keeps the original by default (a mirrored copy, as CAD does;
// the General group's ▾ turns that off and the thing itself is reflected). Ortho steps the line's angle by ROTATE_STEP (Shift
// free), or an angle is typed from the first point. A warehouse block is neither reflected nor copied (its type has one hand),
// gates and drawings are left alone: said once. One undo step; the tool lets go when it is set.
import { actions } from '../../../state/actions/index.ts'
import { withoutHeld } from '../mix.ts'
import { LineTool, type LineSpec } from './LineTool.tsx'
import { useGeneralTools } from './generalSettings.ts'
import type { ToolCamera } from './common.tsx'

/** «30°», «-12.5°»: the line's angle to 0.1°. */
const angleText = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  `${((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toLocaleString('en-US', { maximumFractionDigits: 1 })}°`

const SPEC: LineSpec = {
  tool: 'mirror',
  label: 'Mirror',
  prompt: ['First point of the mirror line', 'Second point of the mirror line'],
  help: ['click or type x,y', 'click, or type the angle · 30 · 90 · 12<30'],
  // the original kept: the whole picked set is copied; not kept, what a locked segment holds stays where it is
  run: (p, option, h, a, b) =>
    useGeneralTools.getState().keep ? actions.mirrorPicked(p, option, h.picked, a, b, true) : actions.mirrorPicked(p, option, withoutHeld(h.picked), a, b, false),
  stays: () => useGeneralTools.getState().keep,
  angle: true,
  text: angleText,
}

export function Mirror({ camera }: { camera: ToolCamera }) {
  return <LineTool camera={camera} spec={SPEC} />
}
