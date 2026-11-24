// The command line on a typed drag (D.1 task 4): while one stands in the main viewport (dragging, or correctable) the line
// is its tool ("Move wall"), its prompt ("Warehouse 2 · wall 4") and its help, and its field shows the same text the keys
// type (`CommandLine.tsx` reads the store). The plan mounts it with `useEditCommand`, which gives way while it stands.
// The block editor's drags are not shown there: its bar has no command line, its field is beside the handle.
import { useEffect } from 'react'
import { useCommand, type Registration } from '../../plan/command/commandState.ts'
import { useRuler, useTool } from '../../plan/tools/toolState.ts'
import { resetTyped, useTyped, type TypedMeasure } from './typed.ts'

const HELP: Record<TypedMeasure, string> = {
  distance: 'how far it moves (m), towards where you dragged it',
  value: 'the value itself',
  angle: 'the angle in degrees',
  point: 'd along the drag · @x,y · d<a · #x,y',
}

/** What the command line says while a typed drag stands: read when it is drawn, so it follows the drag. */
function typedRegistration(what: string, name: string, measure: TypedMeasure, help: string | undefined): Registration {
  return {
    tool: what,
    prompt: name,
    help: help ?? HELP[measure],
    context: () => {
      const c = useTyped.getState().cur
      return { first: false, base: c?.base ?? null, cursor: null, rectangle: false, angle: useCommand.getState().angle }
    },
    // the line's field is the store's text (`CommandLine`): Enter and Escape go to `enterTyped` and `escapeTyped` there
    apply: (c) => c.kind === 'empty',
    cancel: resetTyped,
    oneShot: true,
  }
}

/** Is the main viewport's command line on a typed drag? (`useEditCommand` gives way then.) */
export function useTypedStands(): boolean {
  return useTyped((s) => s.cur !== null && s.cur.mode === 'live')
}

export function useTypedCommand(): void {
  const what = useTyped((s) => (s.cur?.mode === 'live' ? s.cur.what : null))
  const name = useTyped((s) => (s.cur?.mode === 'live' ? s.cur.name : ''))
  const measure = useTyped((s) => s.cur?.measure ?? 'point')
  const help = useTyped((s) => s.cur?.help)
  const tool = useTool((s) => s.tool)
  const ruler = useRuler((s) => s.active)
  useEffect(() => {
    if (what === null || tool !== 'select' || ruler) return
    const r = typedRegistration(what, name, measure, help)
    useCommand.getState().register(r)
    return () => {
      if (useCommand.getState().registration === r) useCommand.getState().register(null)
    }
  }, [what, name, measure, help, tool, ruler])
}
