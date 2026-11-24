// The Tools strip's Align (key Shift+A: commands/tools.ts; Phase AS.5, Decision "Mirror, Array, Align"): whatever is picked is
// lined up on a line given by two clicks (`LineTool.tsx`, which snap, so a wall, a reference line or the boundary gives it):
// each thing moves square to the line until its nearest side touches it (*Edges*) or its centre is on it (*Centres*), as the
// General group's ▾ says. A group moves as one. Streets, gates, dimensions, drawings and an anchored lot alone are left alone:
// said once. One undo step; the tool lets go when it is set. The snap's switch *Align* (View › Align) is another command.
import { actions } from '../../../state/actions/index.ts'
import { withoutHeld } from '../mix.ts'
import { LineTool, type LineSpec } from './LineTool.tsx'
import { useGeneralTools } from './generalSettings.ts'
import { lengthText } from './toolState.ts'
import type { ToolCamera } from './common.tsx'

const SPEC: LineSpec = {
  tool: 'align',
  label: 'Align',
  prompt: ['First point of the line', 'Second point of the line'],
  help: ['click or type x,y', 'click, or type 12 · 12<30 · @5,3'],
  run: (p, option, h, a, b) => actions.alignPicked(p, option, withoutHeld(h.picked), a, b, useGeneralTools.getState().how),
  text: (a, b) => lengthText(Math.hypot(b.x - a.x, b.y - a.y)),
}

export function Align({ camera }: { camera: ToolCamera }) {
  return <LineTool camera={camera} spec={SPEC} />
}
