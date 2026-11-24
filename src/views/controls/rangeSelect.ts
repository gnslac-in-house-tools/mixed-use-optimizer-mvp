// Picking in a list (Decision "Lists select in runs"; the user: "in every list let me select several with Shift, to
// right-click them and, say, delete them; this Shift rule wherever there are things that can be selected in a run"),
// as in Windows' Explorer and Revit's browser:
//   a click      that one alone (it becomes the anchor)
//   Shift        the run from the anchor to it, in the list's order
//   Ctrl / ⌘     that one in or out of what is picked (it becomes the anchor)
// A right-click on one that is not picked picks it alone first (pickForMenu), so the menu always acts on what shows
// picked. Pure: each list keeps its own picked ids and anchor.

export interface Picked<K> {
  ids: K[]
  anchor: K | null
}

type Keys = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }

/** What is picked after a click on `id`, in a list shown in `order`. */
export function rangePick<K>(order: readonly K[], now: Picked<K>, id: K, e: Keys): Picked<K> {
  if (e.shiftKey && now.anchor !== null && order.includes(now.anchor)) {
    const a = order.indexOf(now.anchor)
    const b = order.indexOf(id)
    return { ids: order.slice(Math.min(a, b), Math.max(a, b) + 1), anchor: now.anchor }
  }
  if (e.ctrlKey || e.metaKey) {
    const ids = now.ids.includes(id) ? now.ids.filter((x) => x !== id) : [...now.ids, id]
    return { ids, anchor: id }
  }
  return { ids: [id], anchor: id }
}

/** Before a menu opens on `id`: what is picked stays if it holds `id`; otherwise `id` alone. */
export function pickForMenu<K>(now: Picked<K>, id: K): Picked<K> {
  return now.ids.includes(id) ? now : { ids: [id], anchor: id }
}

/** Is it a click that picks several (Shift, Ctrl or ⌘)? */
export const picksSeveral = (e: Keys): boolean => e.shiftKey || e.ctrlKey || e.metaKey
