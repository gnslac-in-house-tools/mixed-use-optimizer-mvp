// Delete on the docks, doors and patterns picked on a placed block (Phase D.3 review B1): they are taken through the On edge engine, one `take` for each wall, kind and name they stand on,
// one undo step; a refusal is said and nothing is lost. The pick goes. The On edge views are the only ones that write through `actions.editEdge`; the plan's Delete asks them here.
import type { Ref } from '../../../kinds/types.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useEdgePick } from './edgePick.ts'

/** The docks picked on the site taken away; false: none are picked. */
export function takePickedElements(): boolean {
  const { host, ids } = useEdgePick.getState()
  if (!host || ids.length === 0) return false
  const ref: Ref = { kind: 'mass', id: host }
  const els = (actions.edgeOf(useApp.getState().project, ref)?.elements ?? []).filter((x) => ids.includes(x.id))
  const groups = new Map<string, { edge: string; kind: string; name?: string; slots: number[] }>()
  for (const x of els) {
    const k = `${x.edge}|${x.kind}|${x.name ?? ''}`
    const g = groups.get(k) ?? { edge: x.edge, kind: x.kind, ...(x.name !== undefined ? { name: x.name } : {}), slots: [] }
    g.slots.push(x.slot)
    groups.set(k, g)
  }
  let why: string | undefined
  useApp.getState().apply((p) => {
    let q = p
    for (const g of groups.values()) {
      const w = actions.editEdge(q, ref, { op: 'take', ...g })
      if (w.reason) why ??= w.reason
      else q = w.project
    }
    return q
  })
  useEdgePick.getState().clear()
  if (why) useToast.getState().show('info', `${why.replace(/\.$/, '')}.`)
  return true
}
