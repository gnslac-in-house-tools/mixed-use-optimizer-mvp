// Lo que comparten las vistas de uso mixto: el resultado de GFit de un edificio en la opción en vista (memoizado por
// `derivar`), y de cada masa su uso. Nada si la tipología no ofrece el módulo residencial.
import { useMemo } from 'react'
import type { Id, Project } from '../../../model/schema.ts'
import type { DerivedMass } from '../../../engine/types.ts'
import { isOffered } from '../../catalog.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { derivar, type Derivado } from '../engine/derivar.ts'

export type Uso = 'vivienda' | 'comercio' | 'nucleo'

export function usoDe(p: Project, massId: Id): Uso | undefined {
  const prog = p.masses.find((m) => m.id === massId)?.programId
  return prog ? p.residential?.usos[prog]?.uso : undefined
}

/** Las masas derivadas de un edificio que dan niveles (vivienda o comercio). */
export function solidosDe(p: Project, masses: Record<Id, DerivedMass>, buildingId: Id): DerivedMass[] {
  return Object.values(masses).filter((m) => m.buildingId === buildingId && !m.context && (usoDe(p, m.id) === 'vivienda' || usoDe(p, m.id) === 'comercio'))
}

export function useDerivado(buildingId: Id | null | undefined): Derivado | null {
  const project = useShown((s) => s.project)
  const option = useShown((s) => s.derived.option)
  return useMemo(() => (buildingId && isOffered(project, 'residential') ? derivar(project, buildingId, option) : null), [project, buildingId, option])
}

/** El resultado de cada edificio de la opción en vista que tiene vivienda o comercio. */
export function useDerivados(): { buildingId: Id; d: Derivado }[] {
  const project = useShown((s) => s.project)
  const option = useShown((s) => s.derived.option)
  return useMemo(() => {
    if (!isOffered(project, 'residential')) return []
    const o = project.options.find((x) => x.id === option) ?? project.options[0]
    return (o?.buildingIds ?? []).flatMap((b) => {
      const d = derivar(project, b, o?.id)
      return d ? [{ buildingId: b, d }] : []
    })
  }, [project, option])
}
