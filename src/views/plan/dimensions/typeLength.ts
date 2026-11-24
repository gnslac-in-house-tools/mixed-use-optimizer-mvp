// Typing a dimension's length, from the plan (its number) or from Properties: the geometry moves along it
// (`setDimensionLength`). One undo step; when nothing could change, a notice says why.
import type { Id } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'

/** Whether the dimension took the length. Accepts a decimal comma ("12,5"). */
export function typeDimensionLength(id: Id, text: string | number): boolean {
  const v = typeof text === 'number' ? text : Number(text.trim().replace(',', '.'))
  let notice: string | undefined
  let changed = false
  useApp.getState().apply((p) => {
    const r = actions.setDimensionLength(p, id, v)
    notice = r.notice
    changed = r.project !== p
    return r.project
  })
  if (notice) useToast.getState().show('info', notice)
  return changed
}
