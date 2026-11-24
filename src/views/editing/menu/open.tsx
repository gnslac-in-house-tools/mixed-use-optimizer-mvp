// The one right-click menu of the app (Phase AS.4, Decision "One menu"): `openMenu(e, refs, place, at?)` builds the entries for what is picked
// (`build.ts`) and shows them at the pointer; `<MenuHost />`, mounted once in the frame (`App.tsx`), draws it with the AS.1 `Menu` (`controls/
// Menu.tsx`): a portal on the body above the dialogs, flipped at the window's edges (its right and bottom edges go to the pointer), its
// sub-menus beside their row, ↑ ↓ Home End to move, → to open a sub-menu, ← to close it, Escape closing it (the plan keeps its selection),
// a press outside, a scroll or a resize closing it too. The keys are the `Menu`'s (named in `commands/keys.ts`'s LOCAL_KEYS); the focus goes
// back to where it was when the menu closes by Escape or a row picked, not by a press outside (that press keeps its own focus). The menu is named
// after what it is of (`menuName`: the thing's name, "3 masses", "2 things"), not the place it opened in. `openEntries` is the same menu for a short list of its own
// (the bars', when they move here).
// UI state, never in the Project or the history. Asked from the keyboard (the menu key, Shift+F10: no pointer), it opens under the element.
import { create } from 'zustand'
import type { Ref } from '../../../kinds/types.ts'
import type { Point } from '../../../model/schema.ts'
import { Menu, type CloseHow, type MenuEntry } from '../../controls/Menu.tsx'
import { menuFor, menuName, type MenuPlace } from './build.ts'

interface Shown {
  x: number
  y: number
  label: string
  items: MenuEntry[]
  /** What had the focus when the menu opened: it has it again when the menu closes. */
  from: Element | null
}

const useMenuState = create<{ shown: Shown | null }>()(() => ({ shown: null }))

/** The event of a right-click or of the menu key: the pointer's place, or under the element when there is no pointer. */
interface AskEvent {
  clientX: number
  clientY: number
  currentTarget: EventTarget | null
}

/** Where the menu goes: the pointer, or (the menu key sends 0, 0) under the element asking. */
function placeOf(e: AskEvent): { x: number; y: number } {
  if (e.clientX !== 0 || e.clientY !== 0) return { x: e.clientX, y: e.clientY }
  if (e.currentTarget instanceof Element) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: r.left + 8, y: r.bottom }
  }
  return { x: 0, y: 0 }
}

/** Shows a menu of these entries at the pointer; none, no menu. The one place a context menu is put on screen. */
export function openEntries(e: AskEvent, label: string, items: MenuEntry[]): void {
  if (items.length === 0) return
  const { x, y } = placeOf(e)
  useMenuState.setState({ shown: { x, y, label, items, from: document.activeElement } })
}

/**
 * The menu of what is picked, where the right-click was: the entries come from the kind (`menuFor`). `place`: the plan, the 3D, Layers or the
 * Blocks tab (it names the menu; the entries are the same). `at`: the plan's point under the pointer, where Paste here pastes.
 */
export function openMenu(e: AskEvent, refs: Ref[], place: MenuPlace, at: Point | null = null): void {
  openEntries(e, menuName(refs, place), menuFor(refs, place, at))
}

/**
 * Closes the menu. The focus goes back to where it was when the menu closed by Escape or by a row picked (the keyboard's paths; what a pick then
 * does, a window that opens, takes it after); a press outside (`away`, also a scroll or a resize) leaves the focus to the press, so a click on
 * the plan does not leave it on the card the menu came from, where Delete would remove the block.
 */
export function closeMenu(how: CloseHow = 'pick'): void {
  const shown = useMenuState.getState().shown
  if (!shown) return
  useMenuState.setState({ shown: null })
  if (how !== 'away' && shown.from instanceof HTMLElement && shown.from.isConnected) shown.from.focus({ preventScroll: true })
}

/** Whether the menu is on screen. */
export const menuOpen = (): boolean => useMenuState.getState().shown !== null

export function MenuHost() {
  const shown = useMenuState((s) => s.shown)
  if (!shown) return null
  const at = { x: shown.x, y: shown.y }
  return <Menu label={shown.label} items={shown.items} at={at} flip={at} onClose={closeMenu} />
}
