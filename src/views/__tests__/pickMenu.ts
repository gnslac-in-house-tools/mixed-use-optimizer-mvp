// A test helper, not a test: picks an item of the top menu as the user does, by its names. `pickMenu('File', 'Export',
// 'Project (.gft)')` presses the menu bar's File, then the sub-menu Export, then its row; the last name is the item
// that runs. A command that works asynchronously (a download, a picker) is picked with `await pickMenuAsync(...)`: the
// last press runs inside an async `act`, the walk down the menus before it does not (a state update inside an async `act`
// waits for it to end, so the sub-menu would not be there to press). A test that is about the command and not about the
// menu calls `runCommand(id)` instead.
import { act, fireEvent, screen, within } from '@testing-library/react'

/** The menu on top of the open ones (the deepest sub-menu), or null when none is open. */
export function openMenu(): HTMLElement | null {
  const menus = screen.queryAllByRole('menu')
  return menus.length > 0 ? menus[menus.length - 1] : null
}

/** Closes whatever menu is open (a sub-menu, then its menu), as Escape does. */
export function closeMenus(): void {
  for (let i = 0; i < 4 && openMenu(); i++) fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' })
}

/** The row of `label` in a menu panel: its text is the first span (a key or a tick may follow). */
export function rowOf(menu: HTMLElement, label: string): HTMLElement {
  const row = Array.from(menu.querySelectorAll<HTMLElement>('[data-menu-key]')).find((r) => r.querySelector('span')?.textContent === label)
  if (!row) throw new Error(`No row "${label}" in the open menu (rows: ${Array.from(menu.querySelectorAll('[data-menu-key]')).map((r) => r.textContent).join(' | ')})`)
  return row
}

/** Opens the menu bar's `menu` and follows `path` down to the row before the last: the row to press at the end. */
function walk(menu: string, path: string[]): HTMLElement {
  // a menu left open by an earlier pick is closed first (a second press on its button would close it, not open the next)
  closeMenus()
  fireEvent.click(within(screen.getByRole('menubar')).getByRole('menuitem', { name: menu }))
  for (const label of path.slice(0, -1)) {
    const open = openMenu()
    if (!open) throw new Error(`The menu closed before "${label}"`)
    fireEvent.click(rowOf(open, label))
  }
  const open = openMenu()
  if (!open) throw new Error(`The menu closed before "${path.at(-1)}"`)
  return path.length > 0 ? rowOf(open, path.at(-1)!) : open
}

/** Opens the menu bar's `menu` (a press on its button) and follows `path`: sub-menus open, the last row is picked. */
export function pickMenu(menu: string, ...path: string[]): void {
  if (path.length === 0) return void fireEvent.click(within(screen.getByRole('menubar')).getByRole('menuitem', { name: menu }))
  fireEvent.click(walk(menu, path))
}

/** As `pickMenu`, for a command that works asynchronously: the last press runs inside an async `act`. */
export async function pickMenuAsync(menu: string, ...path: string[]): Promise<void> {
  const row = walk(menu, path)
  await act(async () => void fireEvent.click(row))
}
