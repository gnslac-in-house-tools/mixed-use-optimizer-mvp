// The one dispatcher for the keys (Project C, AS.1; spec "Shortcuts"): in place of a chain of `if`s, a key pressed is looked
// up in the registry for the place the user is in, and runs its command when it is enabled.
//   placeNow()    where the user is: Home (it covers a window behind it), a menu open or a window (the shortcuts window too) that is not Rules or the
//                 block editor (`dialog`: only Undo, Redo, Save and Load answer, as they always did), the Rules window, the
//                 block editor (the Program window), any other modal window on screen (`aria-modal`: Project data, the 3D
//                 model export, the tour's offer, the phone's sheet, a confirmation: they are not `useUi.dialog`, but the
//                 project behind them is no more theirs to change) a `dialog` too, else a project
//   dispatch(e)   the chord (`chordOf`), the command that has it there (`commandForKey`), then:
//                   · a field being typed in: the key is the field's, no lookup at all, unless the chord has Ctrl, Alt or Meta,
//                     or is an F-key, and then only a command that answers while typing (Save, Load project) runs: a plain
//                     letter given to Save is a letter in a field
//                   · a held key (`repeat`) runs nothing again but Undo and Redo, and says nothing
//                   · enabled: the browser's own is prevented and the command runs
//                   · not enabled (`enabled()` is a reason): prevented, nothing runs, the reason is shown as a short info
//                     notice, so a key that does nothing says why; except a command with `native` (Copy, Paste, Select
//                     all), whose key is the browser's again when it has nothing to do, and a `quiet` one (Delete), prevented
//                     and silent; the reason is not shown over a confirmation or a notice that is asking something
//                 A chord no command has in the place is left alone: not prevented, nothing said. True when it was a
//                 command's key (handled).
// What is not a command stays out of here: Escape (useShortcuts.ts) and the keys of what is on screen (keys.ts LOCAL_KEYS),
// the ones heard in the capture phase first, which stop the event so it never gets here. `useShortcuts` mounts `dispatch`.
import { useScreen } from '../home/screen.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { chordOf } from './keys.ts'
import { commandForKey } from './shortcuts.ts'
import { useShortcutsWindow } from './shortcutsWindowState.ts'
import type { Place } from './types.ts'

/** Where the user is, for the keys. */
export function placeNow(): Place {
  if (useScreen.getState().home) return 'home'
  // an open menu (the right-click menu, a ⋯, the menu bar's) waits for its own keys
  if (typeof document !== 'undefined' && document.querySelector('[role="menu"]')) return 'dialog'
  // the shortcuts window is a window: the project behind it is not touched by a letter (while it waits for a key it takes
  // every key first, in the capture phase: ShortcutsWindow.tsx)
  if (useShortcutsWindow.getState().open) return 'dialog'
  const dialog = useUi.getState().dialog
  if (dialog === 'rules') return 'rules'
  if (dialog === 'program') return 'block-editor'
  // a modal window that is not `useUi.dialog` (Project data, the 3D model export, the tour's offer, the phone's sheet, a confirmation)
  if (typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]')) return 'dialog'
  return dialog ? 'dialog' : 'project'
}

/** Undo and Redo go on running while their key is held. */
const REPEATS = new Set(['edit.undo', 'edit.redo'])

/** A field is being typed in: its plain keys are the field's. */
const typingIn = (target: EventTarget | null): boolean => {
  const t = target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || !!t.isContentEditable)
}

/** In a field only a chord a field has no use for can be a command's: one with Ctrl, Alt or Meta (Meta is Ctrl in a chord), or an F-key. */
const fieldHasNoUse = (chord: string): boolean => /^(Ctrl|Alt)\+/.test(chord) || /^F\d{1,2}$/.test(chord)

/** A notice is not shown over a question that is waiting: a confirmation, or a notice with a button. */
const asking = (): boolean => {
  const t = useToast.getState()
  return !!t.confirmation || !!t.toast?.action
}

export function dispatch(e: KeyboardEvent): boolean {
  const chord = chordOf(e)
  if (!chord) return false
  const typing = typingIn(e.target)
  // a plain letter typed in a field is the field's: no lookup, so no command (Save given a letter) can take it
  if (typing && !fieldHasNoUse(chord)) return false
  const c = commandForKey(chord, placeNow())
  if (!c) return false
  if (typing && !c.typing) return false
  const why = c.enabled?.() ?? true
  if (why !== true && (typeof c.native === 'function' ? c.native() : c.native)) return false
  e.preventDefault()
  if (why !== true) {
    // held, it says it once, not at every repeat; a quiet command and a question waiting say nothing
    if (!e.repeat && !(typeof c.quiet === 'function' ? c.quiet() : c.quiet) && !asking()) useToast.getState().show('info', why)
    return true
  }
  if (e.repeat && !REPEATS.has(c.id)) return true
  void c.run()
  return true
}
