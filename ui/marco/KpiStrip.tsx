// La barra de KPIs (GIM `views/stats/KpiStrip.tsx`, tamaño compacto): las cifras del plano elegido, separadas por
// líneas finas, y al final el botón para personalizarlas. Las cifras se decidirán con el resto del producto.
import { useMemo } from 'react'
import { amueblar, areaDe } from '../../engine/catalogo'
import { planDe, useApp } from '../store'
import { Icon } from './Icon'

interface Kpi { label: string; value: string; unit?: string; status?: 'within' | 'over' }

function Celda({ k }: { k: Kpi }) {
  return (
    <div role="group" aria-label={k.label} className="flex min-w-0 items-baseline gap-2 px-panel-pad">
      <div className="truncate text-label text-ink-secondary">{k.label}</div>
      <span className="flex min-w-0 items-baseline gap-1.5">
        {k.status && <span aria-hidden data-status={k.status} className="h-2.5 w-2.5 shrink-0 self-center rounded-pill" style={{ background: `var(--status-${k.status})` }} />}
        <span className="block select-text truncate text-body font-semibold tabular-nums">
          <span>{k.value}</span>
          {k.unit && <span className="text-[0.75em] font-medium tracking-normal text-ink-secondary"> {k.unit}</span>}
        </span>
      </span>
    </div>
  )
}

export function KpiStrip() {
  const plan = useApp((s) => planDe(s, s.sel))
  const kpis = useMemo<Kpi[]>(() => {
    if (!plan) return ['Área vendible', 'Fachada', 'Fondo', 'Recintos', 'Muebles', 'Avisos'].map((label) => ({ label, value: '—' }))
    const avisos = amueblar(plan.rooms, plan.reglas).avisos.length
    const util = plan.rooms.reduce((s, r) => s + areaDe(r.shape), 0)
    return [
      { label: 'Área vendible', value: (plan.w * plan.d).toFixed(1), unit: 'm²' },
      { label: 'Fachada', value: plan.w.toFixed(1), unit: 'm' },
      { label: 'Fondo', value: plan.d.toFixed(1), unit: 'm' },
      { label: 'Recintos', value: String(plan.rooms.length), unit: `· ${util.toFixed(0)} m²` },
      { label: 'Muebles', value: String(plan.muebles.length) },
      { label: 'Avisos', value: String(avisos), status: avisos ? 'over' : 'within' },
    ]
  }, [plan])

  return (
    <section className="panel relative mx-gutter mb-gutter px-1 py-1" aria-label="Cifras del plano" data-kpi-size="compact">
      <div className="grid items-center divide-x divide-separator" style={{ gridTemplateColumns: `minmax(0px, 1.3fr) repeat(${kpis.length - 1}, minmax(0px, 1fr)) auto` }}>
        {kpis.map((k) => <Celda key={k.label} k={k} />)}
        <div className="px-2">
          <button type="button" aria-label="Personalizar KPIs" title="Personalizar los KPIs: cuáles y en qué orden (por decidir)" disabled className="pressable grid h-[2rem] w-[2rem] place-items-center rounded-control text-ink-segment hover:bg-hover hover:text-ink disabled:opacity-40">
            <Icon name="kpiCfg" />
          </button>
        </div>
      </div>
    </section>
  )
}
