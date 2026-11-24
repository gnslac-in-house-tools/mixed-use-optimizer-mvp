// What the tests of the one right-click menu share: the entries of the plan's menu for what is picked now (`menuFor` over `pickedRefs()`, as the plan's
// right-click builds them), a flat list of their rows (a sub-menu's too) and a row by its label.
import type { Point } from '../../../../model/schema.ts'
import type { MenuEntry } from '../../../controls/Menu.tsx'
import { pickedRefs } from '../../../plan/mix.ts'
import { menuFor } from '../build.ts'

export type Row = Exclude<MenuEntry, 'separator'>
export type Leaf = Extract<MenuEntry, { onSelect(): void }>

/** The plan's menu for what is picked now (the plan's right-click has a point: Paste here is in it). */
export const planMenu = (at: Point | null = { x: 0, y: 0 }): MenuEntry[] => menuFor(pickedRefs(), 'plan', at)

/** The rows of a menu, a sub-menu's after it, without the separators. */
export const rowsIn = (entries: MenuEntry[]): Row[] => entries.flatMap((e) => (e === 'separator' ? [] : 'items' in e ? [e, ...rowsIn(e.items)] : [e]))

/** The top-level rows' labels and separators, as the menu shows them. */
export const shape = (entries: MenuEntry[]): string[] => entries.map((e) => (e === 'separator' ? '|' : e.label))

/** A row by its key, wherever it is. */
export const rowKeyed = (entries: MenuEntry[], key: string): Row | undefined => rowsIn(entries).find((r) => r.key === key)

/** A row that picks, by key; throws when there is none. */
export function leaf(entries: MenuEntry[], key: string): Leaf {
  const r = rowKeyed(entries, key)
  if (!r || 'items' in r) throw new Error(`no row "${key}" in ${JSON.stringify(shape(entries))}`)
  return r
}
