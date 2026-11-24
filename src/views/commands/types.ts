// The shape of a command (Project C, AS.1; spec "One rule for the whole project"): a command is defined once, here, and
// the top menu, a key, a strip or a right-click menu show it by its id. Nothing else in the app defines a command, a key
// or a menu item. The registry (registry.ts) holds them; the definitions are files by menu (file.ts, edit.ts, view.ts,
// site.ts, design.ts, tools.ts, help.ts…), and a module's tools come from its `views/commands.ts`.
import type { IconName } from '../controls/Icon.tsx'

/** Where a command answers to a key: a project, Home, the Rules window, the block editor (the Program window), any other
 *  window or an open menu (`dialog`: only Undo, Redo, Save and Load answer there, as they always did). Absent: a project. */
export type Place = 'project' | 'home' | 'rules' | 'block-editor' | 'dialog'

/** The windows whose keys are commands of their own: the Rules window and the block editor (the Program window). */
export type WindowName = 'rules' | 'block-editor'

/** The group a window's own commands are listed under in the shortcuts window. */
export const WINDOW_GROUPS: Record<WindowName, string> = { rules: 'Rules window', 'block-editor': 'Block editor' }

/** The Tools strip's groups (spec "The Tools strip"); each is a sub-menu of Tools, General being Tools itself. */
export type ToolGroup = 'general' | 'massing' | 'elements' | 'streets' | 'parking' | 'annotations'

/** The command's place in the Tools strip (`views/tools/ToolStrip.tsx`): its group, its icon and what its button says. A tool is
 *  taken, stays in hand and is let go (its `checked()` says whether it is in hand); a `once` one does something and is neither. */
export interface ToolSpec {
  group: ToolGroup
  icon: IconName
  /** What it does, one sentence without its key: the strip's title (the key is added from the command). */
  hint: string
  /** It does something once (Union, Connect, Group): never in hand, never pressed, no `checked()`. */
  once?: boolean
}

export interface Command {
  /** Unique, 'menu.what': 'file.save', 'edit.undo', 'file.export.cad'. */
  id: string
  /** What the menu says; a function when it changes with the state (Lock, Unlock). */
  label: string | (() => string)
  /** Its one place in the top menu: ['File'], ['File', 'Export'] (its sub-menu). The first is one of `MENUS`. A window's own
   *  command (`window`) stands in no menu: this names its group for the ids and the registry's checks. */
  menu: string[]
  /** A window's own command: a key that only works inside a window that covers the menu bar (the Rules window, the block
   *  editor), so a menu row for it would always be grey. It stands in no menu (neither the bar's nor the phone's sheet); the
   *  shortcuts window lists it under the window's name. */
  window?: WindowName
  /** The default key(s), as the screen writes them: 'Ctrl+S', ['Ctrl+Y', 'Ctrl+Shift+Z']. The first is the one shown. */
  key?: string | string[]
  /** Where it answers; absent: ['project']. */
  where?: Place[]
  /** Answers while a field is being typed in (Save, Load project). */
  typing?: boolean
  /** The browser has a use for this key when the command has nothing to do (Copy, Paste, Select all with nothing picked):
   *  its key is then left alone, not prevented and not explained. A function says when (Copy with a drawing picked is
   *  explained: "Drawings are not copied"). */
  native?: boolean | (() => boolean)
  /** Its key, disabled, says nothing: a stray Delete with nothing picked is prevented (the browser has no use for it) and
   *  no notice is shown, where another command's disabled key says why. A function says when (Delete is quiet with nothing
   *  picked, and still says "A locked mass: unlock first"). */
  quiet?: boolean | (() => boolean)
  /** What it does: what the control it stands for does, by the same function (never a copy of its body). */
  run(): void | Promise<void>
  /** `true`, or why not, in a short sentence ('Nothing to undo'): the menu greys it with the reason as its title. */
  enabled?(): true | string
  /** A tick: the command is a switch, and this says whether it is on; for a `tool`, whether it is in hand. */
  checked?(): boolean
  /** Present when the command stands in the Tools strip: a tool in hand (Select, Move, Draw, Street…) or, with `once`, one that
   *  does something once (Union, Connect, Group). The strip draws it by its group; the Tools menu groups by it too (Group stays
   *  in Edit). */
  tool?: ToolSpec
  /** A separator before it in its menu (not at the top of one). */
  separatorBefore?: boolean
  /** Shown in development only (State graph). */
  dev?: boolean
}
