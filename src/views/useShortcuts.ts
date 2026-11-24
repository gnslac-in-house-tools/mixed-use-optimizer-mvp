// The keyboard, mounted once (Project C, AS.1). Every command's key is the dispatcher's (commands/dispatch.ts: the
// registry says which key runs what, in which place); this file mounts it, as the bubble-phase `keydown` listener the chain
// of `if`s used to be, and keeps what is not a command: Escape, whose meaning depends on what is on screen (so it is not
// remapped; commands/keys.ts RESERVED). `handleKey` is exported so tests can press keys without mounting the app.
//   Escape   ignored while typing in a field; with a window open it is the window's first (in Rules a pick, the relation or
//            the rule tool is let go before the window closes; in the Program window a pick, then the block tool, then the
//            window); then a look in the viewport ends (Decision "Specimen preview"); then an access tool is dropped;
//            then everything picked, of every kind, is let go, the graph's relation and the Layers row picked with it
//            (Decision "Mixed selection").
//            A tool that draws, a drag, a menu and a measure hear their own Escape first, in the capture phase, and stop it.
import { useEffect } from 'react'
import { useGraph } from './graph/graphState.ts'
import { useLayerPick } from './layers/layerPick.ts'
import { useUi } from './layout/ui.ts'
import { letGoAll } from './plan/mix.ts'
import { useAccess } from './plan/access/accessState.ts'
import { letGo } from './tools/hand.ts'
import { endLook, useLook } from './viewport/look.ts'
import { useWarehouse } from '../modules/warehouse/views/warehouseState.ts'
import { dispatch } from './commands/dispatch.ts'
import './commands/index.ts'

/** Escape in a window: what the window has picked goes first, then the window closes. */
function escapeInDialog(dialog: NonNullable<ReturnType<typeof useUi.getState>['dialog']>): void {
  const g = useGraph.getState()
  const w = useWarehouse.getState()
  if (dialog === 'rules' && (g.rule || g.relation || g.tool === 'rule')) {
    g.selectRule(null)
    g.selectRelation(null)
    g.setTool('select')
  } else if (dialog === 'program' && (w.picked.length || w.tool !== 'select')) {
    if (w.picked.length) w.setPicked([])
    else w.setTool('select')
  } else useUi.getState().closeDialog()
}

/** Escape: not a command, a key of what is on screen. True when it did something (the browser's is then prevented). */
function escapeKey(e: KeyboardEvent): boolean {
  if (e.key !== 'Escape') return false
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return false
  const dialog = useUi.getState().dialog
  if (dialog) escapeInDialog(dialog)
  else if (useLook.getState().look) {
    endLook()
    return false // as it always was: the browser's Escape is not prevented
  } else if (useAccess.getState().tool) {
    useAccess.getState().pick(null)
    letGo()
  } else {
    letGoAll()
    useGraph.getState().selectRelation(null)
    // a row of Layers that is not an object (a branch, Streets, a building…) goes with them
    useLayerPick.getState().clear()
  }
  return true
}

/** A key pressed: a command's (the dispatcher) or Escape. */
export function handleKey(e: KeyboardEvent): void {
  if (dispatch(e)) return
  if (escapeKey(e)) e.preventDefault()
}

export function useShortcuts() {
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])
}
