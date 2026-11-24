// El panel izquierdo (GIM: «Layers and properties»): la fila de pestañas — Capas · Catálogo · Propiedades, y al final
// Optimizar y Agente, «próximamente» como en GIM — y el cuerpo de la elegida. El catálogo es la pestaña de inicio.
import { useState } from 'react'
import { TIPOS, areaDe } from '../../engine/catalogo'
import { Catalogo } from '../Catalogo'
import { planDe, useApp } from '../store'
import { Icon } from './Icon'
import type { NombreIcono } from './iconos'
import { PanelColumn } from './PanelColumn'
import { useUi, type TabIzq } from './ui'

const TABS: { key: TabIzq; label: string; icon: NombreIcono; title: string }[] = [
  { key: 'capas', label: 'Capas', icon: 'tabLayers', title: 'Capas: lo que tiene el plano elegido, en un árbol' },
  { key: 'catalogo', label: 'Catálogo', icon: 'tabBlocks', title: 'Catálogo: las plantas de unidad, de GFit y las tuyas' },
  { key: 'propiedades', label: 'Propiedades', icon: 'tabProperties', title: 'Propiedades: los datos del plano elegido' },
]
const tabCls = 'pressable relative flex h-7 items-center rounded-control text-label leading-none disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-segment'

function Tabs() {
  const tab = useUi((s) => s.tabIzq)
  const setTab = useUi((s) => s.setTabIzq)
  return (
    <div role="tablist" aria-label="Pestañas del panel" className="flex shrink-0 items-center gap-1 px-panel-pad pb-1 pt-2">
      {TABS.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} title={t.title} onClick={() => setTab(t.key)}
          className={`${tabCls} shrink-0 gap-1 px-1.5 ${tab === t.key ? 'bg-fill font-semibold text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'}`}>
          <Icon name={t.icon} className="h-4 w-4 shrink-0" />
          <span className="truncate">{t.label}</span>
        </button>
      ))}
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <button type="button" role="tab" aria-selected={false} aria-label="Optimizar" title="Optimizador: en desarrollo, disponible pronto" disabled className={`${tabCls} w-6 shrink-0 justify-center text-ink-segment`}><Icon name="tabOptimize" className="h-4 w-4 shrink-0" /></button>
        <button type="button" role="tab" aria-selected={false} aria-label="Agente" title="Agente: en desarrollo, disponible pronto" disabled className={`${tabCls} w-6 shrink-0 justify-center text-ink-segment`}><Icon name="tabAgent" className="h-4 w-4 shrink-0" /></button>
      </span>
    </div>
  )
}

/** Una fila del árbol de Capas (GIM `views/layers`): flecha, nombre, cuenta y el ojo. */
function Fila({ nivel, nombre, cuenta, color, abierto, onToggle }: { nivel: number; nombre: string; cuenta?: number; color?: string; abierto?: boolean; onToggle?: () => void }) {
  return (
    <div role="treeitem" aria-expanded={onToggle ? abierto : undefined} className="flex h-row items-center gap-1.5 rounded-control pr-1 text-body hover:bg-hover" style={{ paddingLeft: `${0.25 + nivel * 1}rem` }}>
      <button type="button" onClick={onToggle} tabIndex={onToggle ? 0 : -1} aria-hidden={!onToggle} className={`grid h-4 w-4 shrink-0 place-items-center text-ink-segment ${onToggle ? '' : 'invisible'}`}>
        <Icon name="sec" className={`h-3 w-3 transition-transform ${abierto ? '' : '-rotate-90'}`} />
      </button>
      {color && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />}
      <span className="min-w-0 flex-1 truncate">{nombre}</span>
      {cuenta !== undefined && <span className="text-caption tabular-nums text-ink-tertiary">{cuenta}</span>}
    </div>
  )
}

function Capas() {
  const plan = useApp((s) => planDe(s, s.sel))
  const [open, setOpen] = useState<Record<string, boolean>>({ unidad: true, recintos: true, muebles: false })
  const t = (k: string) => () => setOpen((o) => ({ ...o, [k]: !o[k] }))
  if (!plan) return <p className="px-panel-pad pt-3 text-caption text-ink-secondary">Elige un plano del catálogo.</p>
  const tipo = TIPOS.find((x) => x.id === plan.typeId)
  return (
    <div role="tree" aria-label="Capas" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-panel-pad pt-2">
      <Fila nivel={0} nombre={plan.name} color={tipo?.color} abierto={open.unidad} onToggle={t('unidad')} />
      {open.unidad && <>
        <Fila nivel={1} nombre="Recintos" cuenta={plan.rooms.length} abierto={open.recintos} onToggle={t('recintos')} />
        {open.recintos && plan.rooms.map((r, i) => <Fila key={i} nivel={2} nombre={`${r.name} · ${areaDe(r.shape).toFixed(1)} m²`} />)}
        <Fila nivel={1} nombre="Muebles" cuenta={plan.muebles.length} abierto={open.muebles} onToggle={t('muebles')} />
        {open.muebles && plan.muebles.map((m) => <Fila key={m.id} nivel={2} nombre={`${m.kind} · ${plan.rooms[m.room]?.name ?? ''}`} />)}
        <Fila nivel={1} nombre="Fachada" />
      </>}
    </div>
  )
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-label text-ink-secondary">{label}</span>
      <span className="text-body tabular-nums text-ink">{children}</span>
    </div>
  )
}

function Propiedades() {
  const plan = useApp((s) => planDe(s, s.sel))
  const renombrar = useApp((s) => s.renombrar)
  if (!plan) return <p className="px-panel-pad pt-3 text-caption text-ink-secondary">Elige un plano del catálogo.</p>
  const tipo = TIPOS.find((x) => x.id === plan.typeId)
  const mia = !plan.id.startsWith('G-')
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-panel-pad pb-panel-pad pt-3">
      <section className="flex flex-col gap-2">
        <h3 className="text-label text-ink-secondary">Plano</h3>
        {mia
          ? <input key={plan.id} defaultValue={plan.name} aria-label="Nombre" onBlur={(e) => renombrar(plan.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} className="h-[1.75rem] rounded-control bg-panel px-1.5 text-body text-ink shadow-control outline-none" />
          : <div className="text-body font-semibold">{plan.name}</div>}
        <Dato label="Tipo"><span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: tipo?.color }} />{tipo?.name}</span></Dato>
        <Dato label="Origen">{plan.id.startsWith('G-') ? 'Biblioteca GFit' : plan.origen === 'manual' ? 'A mano' : 'Generado'}</Dato>
        <Dato label="Ancho (fachada)">{plan.w.toFixed(2)} m</Dato>
        <Dato label="Fondo">{plan.d.toFixed(2)} m</Dato>
        <Dato label="Rango del tipo">{tipo ? `${tipo.wMin}–${tipo.wMax} m` : '—'}</Dato>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-label text-ink-secondary">Reglas de amueblado</h3>
        <Dato label="Cama principal">{plan.reglas.cama}</Dato>
        <Dato label="Comedor">{plan.reglas.comedor} sillas</Dato>
        <Dato label="Paso libre">{plan.reglas.paso.toFixed(2)} m</Dato>
        <Dato label="Clósets">{plan.reglas.closets ? 'Sí' : 'No'}</Dato>
      </section>
    </div>
  )
}

export function PanelIzquierdo() {
  const tab = useUi((s) => s.tabIzq)
  return (
    <PanelColumn side="left" tabs={<Tabs />}>
      {tab === 'catalogo' ? <Catalogo /> : tab === 'capas' ? <Capas /> : <Propiedades />}
    </PanelColumn>
  )
}
