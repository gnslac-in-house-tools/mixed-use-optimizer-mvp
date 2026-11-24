// El panel derecho (GIM «Summary»): el riel de pestañas por la orilla de afuera — Resumen · Contra el programa ·
// Avisos — y su cuerpo: secciones plegables de cifras, como el Overview de GIM.
import { useState, type ReactNode } from 'react'
import { ROOMS0 } from '../../engine/gfit/src/model/program'
import { ROOM_FILL, TIPOS, amueblar, areaDe, nombreRecinto } from '../../engine/catalogo'
import { planDe, useApp } from '../store'
import { Icon } from './Icon'
import type { NombreIcono } from './iconos'
import { PanelColumn } from './PanelColumn'
import { useUi, type TabDer } from './ui'

const RAIL: { key: TabDer; label: string; icon: NombreIcono }[] = [
  { key: 'resumen', label: 'Resumen', icon: 'railOverview' },
  { key: 'programa', label: 'Contra el programa', icon: 'railAgainstTheBrief' },
  { key: 'avisos', label: 'Avisos', icon: 'railIssues' },
]

function Rail({ avisos }: { avisos: number }) {
  const tab = useUi((s) => s.tabDer)
  const setTab = useUi((s) => s.setTabDer)
  return (
    <div role="tablist" aria-label="Resumen" aria-orientation="vertical" className="flex w-side-rail shrink-0 flex-col items-center gap-1 border-l border-separator py-3">
      {RAIL.map((t) => {
        const on = t.key === tab
        const n = t.key === 'avisos' ? avisos : 0
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} aria-label={n ? `${t.label}, ${n}` : t.label} title={t.label} onClick={() => setTab(t.key)}
            className={`pressable relative grid h-9 w-9 place-items-center rounded-control ${on ? 'bg-fill text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'}`}>
            <Icon name={t.icon} className="h-[1.125rem] w-[1.125rem]" />
            {n > 0 && <span aria-hidden className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-pill bg-status-over px-1 text-caption leading-none text-on-ink">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Seccion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-1 self-start text-label text-ink-secondary hover:text-ink">
        <Icon name="sec" className={`h-3 w-3 transition-transform ${open ? '' : '-rotate-90'}`} />
        <h2>{title}</h2>
      </button>
      {open && children}
    </section>
  )
}

function Fila({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'within' | 'over' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-label text-ink-secondary">{label}</span>
      <span className={`text-body tabular-nums ${tone === 'over' ? 'text-status-over' : tone === 'within' ? 'text-status-within' : 'text-ink'}`}>{value}</span>
    </div>
  )
}

const cuerpo = 'flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-panel-pad pb-panel-pad pt-3'

export function PanelDerecho() {
  const plan = useApp((s) => planDe(s, s.sel))
  const tab = useUi((s) => s.tabDer)
  const avisos = plan ? amueblar(plan.rooms, plan.reglas).avisos : []
  const title = RAIL.find((r) => r.key === tab)!.label
  const tipo = plan ? TIPOS.find((t) => t.id === plan.typeId) : undefined

  let body: ReactNode = <p className="px-panel-pad pt-3 text-caption text-ink-secondary">Elige un plano del catálogo.</p>
  if (plan && tab === 'resumen') {
    const util = plan.rooms.reduce((s, r) => s + areaDe(r.shape), 0)
    const porTipo = new Map<string, { n: number; a: number }>()
    for (const r of plan.rooms) { const v = porTipo.get(r.kind) ?? { n: 0, a: 0 }; porTipo.set(r.kind, { n: v.n + 1, a: v.a + areaDe(r.shape) }) }
    body = (
      <div role="tabpanel" aria-label="Resumen" className={cuerpo}>
        <Seccion title="Unidad">
          <Fila label="Área vendible" value={`${(plan.w * plan.d).toFixed(1)} m²`} />
          <Fila label="Área de recintos" value={`${util.toFixed(1)} m²`} />
          <Fila label="Fachada" value={`${plan.w.toFixed(2)} m`} />
          <Fila label="Fondo" value={`${plan.d.toFixed(2)} m`} />
          <Fila label={`Fachada en rango (${tipo?.wMin}–${tipo?.wMax} m)`} value={tipo && plan.w >= tipo.wMin - 1e-6 && plan.w <= tipo.wMax + 1e-6 ? 'Sí' : 'No'} tone={tipo && plan.w >= tipo.wMin - 1e-6 && plan.w <= tipo.wMax + 1e-6 ? 'within' : 'over'} />
        </Seccion>
        <Seccion title="Recintos por tipo">
          <table aria-label="Recintos por tipo" className="w-full table-fixed text-body">
            <thead><tr className="text-left text-caption text-ink-secondary"><th className="w-[56%] pb-1 font-medium">Recinto</th><th className="pb-1 text-right font-medium">Cant.</th><th className="pb-1 text-right font-medium">Área</th></tr></thead>
            <tbody>
              {[...porTipo].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-0.5 pr-2"><span className="flex min-w-0 items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: ROOM_FILL[k] ?? '#eee', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} /><span className="truncate">{nombreRecinto(k, k)}</span></span></td>
                  <td className="py-0.5 text-right tabular-nums">{v.n}</td>
                  <td className="py-0.5 text-right tabular-nums">{v.a.toFixed(1)} m²</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>
        <Seccion title="Muebles">
          <Fila label="Piezas" value={plan.muebles.length} />
          <Fila label="Cama principal" value={plan.reglas.cama} />
        </Seccion>
      </div>
    )
  } else if (plan && tab === 'programa') {
    const R = ROOMS0()
    const pide = (tipo?.rooms ?? []).map((id) => R.find((r) => r.id === id)).filter((r) => !!r)
    body = (
      <div role="tabpanel" aria-label="Contra el programa" className={cuerpo}>
        <Seccion title={`Programa de ${tipo?.name ?? 'su tipo'}`}>
          {pide.map((r, i) => {
            const hay = plan.rooms.filter((x) => x.kind === r.kind)
            const a = hay.reduce((s, x) => s + areaDe(x.shape), 0) / Math.max(1, hay.length)
            const ok = hay.length > 0 && a >= r.area[0] - 0.5
            return <Fila key={i} label={`${nombreRecinto(r.kind, r.name)} (${r.area[0]}–${r.area[1]} m²)`} value={hay.length ? `${a.toFixed(1)} m²` : 'falta'} tone={ok ? 'within' : 'over'} />
          })}
        </Seccion>
      </div>
    )
  } else if (plan && tab === 'avisos') {
    body = (
      <div role="tabpanel" aria-label="Avisos" className={cuerpo}>
        {avisos.length
          ? <ul className="flex flex-col gap-2">{avisos.map((a, i) => <li key={i} className="flex gap-2 text-body"><span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-pill bg-status-over" />{a}</li>)}</ul>
          : <p className="flex items-center gap-2 text-body text-status-within"><span aria-hidden className="h-2 w-2 rounded-pill bg-status-within" />Sin avisos: todo cabe.</p>}
      </div>
    )
  }

  return (
    <PanelColumn side="right" title={title} rail={<Rail avisos={avisos.length} />}>
      {body}
    </PanelColumn>
  )
}
