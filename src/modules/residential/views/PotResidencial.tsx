// El POT del proyecto (Plan de Ordenamiento Territorial) en las Properties del sitio, bajo «Site rules»: el índice de
// edificabilidad y la altura máxima (del módulo residencial) y la ocupación máxima, que es la de las reglas del sitio de
// GIM (una sola para GIM y GFit). Cada cambio es un paso de deshacer. Solo en la tipología Uso mixto.
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { NumberField, Section } from '../../../views/controls/fields.tsx'
import { useModule } from '../../../views/modules.ts'
import { potDe } from '../engine/defaults.ts'

export function PotResidencial() {
  const { offered } = useModule('residential')
  const project = useApp((s) => s.project)
  const apply = useApp((s) => s.apply)
  if (!offered || !project.residential) return null
  const pot = potDe(project)
  return (
    <section aria-label="POT">
      <Section title="POT (del proyecto)">
        <NumberField label="Índice de edificabilidad" min={0.1} decimals={2} value={pot.indice} onCommit={(v) => apply((p) => actions.setPot(p, { indice: v }))} />
        <NumberField label="Altura máxima" unit="m" min={1} value={pot.altura} onCommit={(v) => apply((p) => actions.setPot(p, { altura: v }))} />
        <NumberField label="Ocupación máxima" unit="%" min={0} max={100} value={(project.site.rules.maxCoverage ?? 1) * 100} onCommit={(v) => apply((p) => actions.updateSiteRules(p, { maxCoverage: v / 100 }))} />
        <p className="text-caption text-ink-secondary">Lo que no cumple sale en los avisos de Uso mixto («POT: …»); el índice entra a la calificación.</p>
      </Section>
    </section>
  )
}
