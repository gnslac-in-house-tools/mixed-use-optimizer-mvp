// The KPI registry: values read from the demo project, statuses against limits, program KPIs, the project's choice.
import { describe, expect, it } from 'vitest'
import { derive } from '../derive.ts'
import { DEFAULT_KPIS } from '../kpis.ts'
import { massHeight } from '../levels.ts'
import { chosenKpis, kpiCatalog, readKpi, readKpis } from '../../modules/catalog.ts'
import { demoProject } from '../../state/demo.ts'

describe('KPIs', () => {
  const p = demoProject()
  const d = derive(p)

  it('the catalog has the static KPIs and one footprint per program', () => {
    const ids = kpiCatalog(p).map((k) => k.id)
    expect(ids).toEqual(expect.arrayContaining(['site-area', 'coverage', 'built-volume', 'issues', 'program:warehouse', 'program:office']))
    expect(kpiCatalog(p).find((k) => k.id === 'program:warehouse')!.label).toBe('Warehouse footprint')
  })

  it('reads plain numbers in metres from Derived', () => {
    expect(readKpi('built-footprint', p, d)!.value).toBeCloseTo(d.metrics.builtFootprint, 9)
    expect(readKpi('program:warehouse', p, d)!.value).toBeCloseTo(24_000, 6)
    const volume = p.masses.reduce((s, m) => s + d.masses[m.id].area * massHeight(p, m), 0)
    expect(readKpi('built-volume', p, d)).toMatchObject({ unit: 'm3', value: volume })
    expect(readKpi('open-area', p, d)!.value).toBeCloseTo(d.metrics.siteArea - d.metrics.builtFootprint, 6)
    // the demo's three masses are one building (Decision "Buildings and options")
    expect(readKpi('buildings', p, d)!.value).toBe(1)
    expect(readKpi('masses', p, d)!.value).toBe(3)
  })

  it('coverage carries its limit and status; issues turn over with an error', () => {
    expect(readKpi('coverage', p, d)).toMatchObject({ limit: 0.6, status: 'within' })
    const tight = { ...p, site: { ...p.site, rules: { ...p.site.rules, maxCoverage: 0.1 } } }
    const dt = derive(tight)
    expect(readKpi('coverage', tight, dt)!.status).toBe('over')
    expect(readKpi('issues', tight, dt)).toMatchObject({ status: 'over' })
    // two warnings (the example rule the demo's office breaks, the guard house the brief asks for): not over
    expect(readKpi('issues', p, d)).toMatchObject({ value: 2, status: 'within' })
  })

  it('without a site, the site KPIs cannot be measured yet', () => {
    const noSite = { ...p, site: { ...p.site, boundary: null } }
    const dn = derive(noSite)
    expect(readKpi('site-area', noSite, dn)!.value).toBeNull()
    expect(readKpi('coverage', noSite, dn)).toMatchObject({ value: null, status: null })
  })

  it('the strip follows the project’s order; unknown ids drop; no choice = the default', () => {
    expect(chosenKpis(p)).toEqual(p.kpis)
    expect(readKpis(p, d).map((k) => k.id)).toEqual(p.kpis)
    const odd = { ...p, kpis: ['issues', 'program:gone', 'coverage'] }
    expect(chosenKpis(odd)).toEqual(['issues', 'coverage'])
    expect(readKpi('program:gone', odd, d)).toBeNull()
    const none = { ...p, kpis: undefined }
    expect(chosenKpis(none)).toEqual(DEFAULT_KPIS)
  })
})
