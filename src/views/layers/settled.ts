// The project and the derived result Layers is drawn from (Phase AS.3, Decision "Layers"): the viewer's, not a drag's. While a
// drag is in progress (`store.dragStart` is set) every pointer move previews a new project and derives it again, and a tree
// rebuilt from each would redraw every row on every move. The tree is built from the last project and result of before the drag
// instead, and once when the drag ends (the drop commits a project; a cancel gives the old one back, and then nothing is
// rebuilt). Both the tree (LayersTab.tsx) and what Properties reads from it (LayerProperties.tsx) take their source from here.
import { useRef } from 'react'
import type { Derived } from '../../engine/types.ts'
import type { Project } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'

export interface Settled {
  project: Project
  derived: Derived
}

/** The project and derived result in view, held at what they were before a drag began for as long as the drag lasts. */
export function useSettled(): Settled {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const dragging = useApp((s) => s.dragStart !== null)
  const held = useRef<Settled>({ project, derived })
  if (!dragging && (held.current.project !== project || held.current.derived !== derived)) held.current = { project, derived }
  return held.current
}
