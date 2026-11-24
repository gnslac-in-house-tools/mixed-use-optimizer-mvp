// Editing what stands on a host's edges: docks, doors and patterns on a block's walls (Phase D.3, Decision "On edge engine"). One pair of verbs,
// as the Shape engine has: `edgeOf(p, host)` (what its controls draw: the walls with their slots, the elements on them) and `editEdge(p, host, op)`
// (one operation, `engine/edge/onEdge.ts`), with one adapter a host (`EDGE_ADAPTERS`, checked against the hosts the kinds' `onEdge` names): a block
// type's in the block editor (`block-type`), a placed block's hall on the site (`mass`: the copy's own elements, a variant), and (Phase PE.2) the gates on a
// street's side (`street`), an existing street's (`existing-road`) or the site's boundary (`boundary`: `gateEdges.ts`). A refusal is the SAME
// project and why. The verbs of before (`putElements`, `slideElements`, `setElementsWidth`, `putCopyElements`) are wrappers over the same core.
import type { EdgeAdapter, EdgeOp, EdgeRead, EdgeWrite } from '../../engine/edge/onEdge.ts'
import { kinds, type Ref } from '../../kinds/index.ts'
import type { Id, Project } from '../../model/schema.ts'
import { blockEdgeOf, editBlockEdge, editTypeEdge, typeEdgeOf } from '../../modules/warehouse/actions.ts'
import { BOUNDARY_EDGES, EXISTING_EDGES, STREET_EDGES } from './gateEdges.ts'

/** How each host is read and written, by the host kind's id (`__tests__/onEdge.test.ts` checks it against the kinds' `onEdge`). */
export const EDGE_ADAPTERS: Record<string, EdgeAdapter> = {
  'block-type': { read: typeEdgeOf, write: editTypeEdge },
  mass: { read: blockEdgeOf, write: editBlockEdge },
  street: STREET_EDGES,
  'existing-road': EXISTING_EDGES,
  boundary: BOUNDARY_EDGES,
}

/** The walls of the host `host` names, with their slots and the elements on them, in the viewport's frame; null when there is none (or it takes none). `optionId`: the option a street's and a gate's are of. */
export function edgeOf(p: Project, host: Ref, optionId?: Id): EdgeRead | null {
  return EDGE_ADAPTERS[host.kind]?.read(p, host, optionId) ?? null
}

/** One operation on the elements on the host's edges; a host that has no edges to stand on, or that is not there, refuses with its reason. */
export function editEdge(p: Project, host: Ref, op: EdgeOp, optionId?: Id): EdgeWrite {
  const adapter = EDGE_ADAPTERS[host.kind]
  if (!adapter || !kinds(p).some((k) => k.onEdge?.hosts.includes(host.kind))) return { project: p, reason: `A ${host.kind} has no edges to edit` }
  return adapter.write(p, host, op, optionId)
}
