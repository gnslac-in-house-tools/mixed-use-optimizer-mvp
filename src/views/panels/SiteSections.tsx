// The Site's figures and its rules, the two sections Properties mounts (the Site tab's too, until Phase AS.3 took it away, Decision "Settings by
// what is picked"): picking Site, Boundary or Buildable area in Layers shows them there, under Location. Site: the site's area,
// the buildable area and the coverage now (a dash until the site has a boundary). Site rules: the setback, the maximum
// coverage and the ground's maximum slope to build (Decision "Terrain": a built mass on steeper ground is an Issue). Every field
// sends a pure action through store.apply (one undo step each).
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { NumberField, Section, Total } from '../controls/fields.tsx'
import { formatFigure } from '../format.ts'

export function SiteFigures() {
  const metrics = useApp((s) => s.derived.metrics)
  const hasSite = useApp((s) => s.derived.site.polygon !== null)
  const figure = (v: number | null, unit: 'm2' | 'pct') => formatFigure(hasSite ? v : null, unit)
  return (
    <Section title="Site">
      <dl aria-label="Site figures" className="flex flex-col gap-1.5">
        <Total label="Site area" value={figure(metrics.siteArea, 'm2')} />
        <Total label="Buildable area" value={figure(metrics.buildableArea, 'm2')} />
        <Total label="Coverage now" value={figure(metrics.coverage, 'pct')} />
      </dl>
    </Section>
  )
}

export function SiteRules() {
  const rules = useApp((s) => s.project.site.rules)
  const apply = useApp((s) => s.apply)
  return (
    <Section title="Site rules">
      <NumberField label="Setback" unit="m" min={0} value={rules.setback} onCommit={(v) => apply((p) => actions.updateSiteRules(p, { setback: v }))} />
      <NumberField
        label="Max. coverage"
        unit="%"
        min={0}
        max={100}
        value={(rules.maxCoverage ?? 1) * 100}
        onCommit={(v) => apply((p) => actions.updateSiteRules(p, { maxCoverage: v / 100 }))}
      />
      {/* the ground's (Decision "Terrain"): a built mass on steeper ground is an Issue */}
      <NumberField
        label="Max. slope to build"
        unit="%"
        min={0.1}
        max={100}
        decimals={1}
        value={rules.maxSlope ? rules.maxSlope * 100 : null}
        onCommit={(v) => apply((p) => actions.updateSiteRules(p, { maxSlope: v / 100 }))}
      />
    </Section>
  )
}
