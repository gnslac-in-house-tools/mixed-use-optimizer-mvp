// Isolate (Decision "Isolate in the Overview"; the user: "a click on a building or a program in the Overview isolates
// it and filters the KPIs"): one building or one program of the active option picked in the Overview; the plan and
// the 3D draw the other masses faint, and the KPI strip and the Overview read the option as if it had those masses
// alone (the project with the others left out, derived once per pick and design). The view's, never the project's:
// no undo step, not in the file. Picking it again, its ✕, Escape or another option lets it go.
import { useMemo } from 'react'
import { create } from 'zustand'
import type { Id, Mass, Project } from '../../model/schema.ts'
import { buildingOf } from '../../engine/buildings.ts'
import { derive } from '../../engine/derive.ts'
import type { Derived } from '../../engine/types.ts'
import { useApp } from '../../state/store.ts'

export type Isolated = { kind: 'building' | 'program'; id: Id } | null

export const useIsolate = create<{ isolated: Isolated; toggle(kind: 'building' | 'program', id: Id): void; clear(): void }>()((set, get) => ({
  isolated: null,
  toggle: (kind, id) => {
    const now = get().isolated
    set({ isolated: now && now.kind === kind && now.id === id ? null : { kind, id } })
  },
  clear: () => set({ isolated: null }),
}))

/** Does the mass belong to what is isolated? (Nothing isolated: every mass does.) */
export function inIsolated(p: Project, m: Mass, isolated: Isolated): boolean {
  if (!isolated) return true
  if (isolated.kind === 'program') return (m.programId ?? 'none') === isolated.id
  return buildingOf(p, m).id === isolated.id
}

/** The project with only the isolated masses (the site, the buildings, the levels and the brief as they are). Pure. */
export function isolatedProject(p: Project, isolated: Isolated): Project {
  if (!isolated) return p
  const keep = new Set(p.masses.filter((m) => inIsolated(p, m, isolated)).map((m) => m.id))
  return {
    ...p,
    masses: p.masses.filter((m) => keep.has(m.id)),
    ...(p.dimensions ? { dimensions: p.dimensions.filter((d) => (!d.anchorA || keep.has(d.anchorA.massId)) && (!d.anchorB || keep.has(d.anchorB.massId))) } : {}),
  }
}

/** The isolated option's project and derived (the strip's and the Overview's figures); null while nothing is. */
export function useIsolatedDerived(): { project: Project; derived: Derived } | null {
  const isolated = useIsolate((s) => s.isolated)
  const project = useApp((s) => s.project)
  const option = useApp((s) => s.option)
  return useMemo(() => {
    if (!isolated) return null
    const q = isolatedProject(project, isolated)
    return { project: q, derived: derive(q, option) }
  }, [isolated, project, option])
}

/** What is isolated, by name ("Warehouse", "Building 1"); null while nothing is. */
export function isolatedName(p: Project, isolated: Isolated): string | null {
  if (!isolated) return null
  if (isolated.kind === 'program') return isolated.id === 'none' ? 'No program' : (p.programs.find((g) => g.id === isolated.id)?.name ?? null)
  return p.buildings.find((b) => b.id === isolated.id)?.name ?? null
}

// another option: what was isolated was this one's
useApp.subscribe((s, before) => {
  if (s.option !== before.option && useIsolate.getState().isolated) useIsolate.getState().clear()
})
