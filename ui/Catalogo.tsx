// El catálogo de unidades, como pestaña del panel izquierdo (en GIM, el lugar de Bloques): la Biblioteca GFit
// (generada por el motor) y Mi biblioteca (guardada en el navegador), filtro por tipo, crear (con el motor o vacío),
// copiar y borrar. Clic en una tarjeta: se ve en el viewport.
import { useState } from 'react'
import type { PlanCatalogo } from '../engine/catalogo'
import { TIPOS } from '../engine/catalogo'
import { Segmented } from './marco/Icon'
import { PlanMini } from './PlanMini'
import { useApp, type Lib } from './store'

const color = (id: string) => TIPOS.find((t) => t.id === id)?.color ?? '#ccc'
const campo = 'h-[1.75rem] rounded-control bg-panel px-1.5 text-label text-ink shadow-control outline-none'

function Tarjeta({ c }: { c: PlanCatalogo }) {
  const sel = useApp((s) => s.sel === c.id)
  const setSel = useApp((s) => s.setSel)
  const copiar = useApp((s) => s.copiar)
  const borrar = useApp((s) => s.borrar)
  const setAviso = useApp((s) => s.setAviso)
  const enMia = useApp((s) => (c.id.startsWith('G-') ? s.mia.some((m) => m.desde === c.id) : false))
  const preset = c.id.startsWith('G-')
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={sel}
      onClick={() => setSel(c.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(c.id) } }}
      data-testid={'cat-' + c.id}
      className={`group flex cursor-pointer flex-col gap-1 rounded-control p-2 transition-colors ${sel ? 'bg-fill shadow-control' : 'hover:bg-hover'}`}
    >
      <div className="flex min-h-[1.25rem] items-center justify-between">
        <span className={`rounded-pill px-1.5 text-caption ${preset ? (enMia ? 'bg-status-within-soft text-status-within' : 'bg-fill text-ink-segment') : c.origen === 'manual' ? 'bg-earth-soft text-earth' : 'bg-fill text-ink-segment'}`}>
          {preset ? (enMia ? '✓ En Mi biblioteca' : 'GFit') : c.origen === 'manual' ? 'a mano' : 'generado'}
        </span>
        <span className={`flex gap-0.5 ${sel ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { copiar(c.id); setAviso(`«${c.name}» se copió a Mi biblioteca.`) }} aria-label={'Copiar ' + c.name + ' a Mi biblioteca'} title="Copiar a Mi biblioteca" className="pressable grid h-5 w-5 place-items-center rounded-control text-ink-segment hover:bg-hover hover:text-ink">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" /></svg>
          </button>
          {!preset && (
            <button type="button" onClick={() => { borrar(c.id); setAviso(`«${c.name}» se borró de Mi biblioteca.`) }} aria-label={'Borrar ' + c.name} title="Borrar" data-testid={'cat-borrar-' + c.id} className="pressable grid h-5 w-5 place-items-center rounded-control text-ink-segment hover:bg-hover hover:text-status-over">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          )}
        </span>
      </div>
      <div className="rounded-control bg-panel p-1"><PlanMini p={c} h={58} /></div>
      <div className="flex min-w-0 items-center gap-1.5 text-label font-semibold" title={c.name}>
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color(c.typeId) }} />
        <span className="truncate">{c.name}</span>
      </div>
      <div className="text-caption tabular-nums text-ink-secondary">{c.w.toFixed(1)} × {c.d.toFixed(1)} m · {Math.round(c.w * c.d)} m²</div>
    </div>
  )
}

export function Catalogo() {
  const { lib, mia, gfit, filtro, setLib, setFiltro, crear, setAviso } = useApp()
  const [form, setForm] = useState<{ type: string; w: string; d: string } | null>(null)
  const list = (lib === 'mia' ? mia : gfit).filter((c) => !filtro || c.typeId === filtro)

  function enviar(vacio: boolean) {
    if (!form) return
    const id = crear(form.type, Number(form.w), Number(form.d), vacio)
    if (!id) { setAviso('El ancho y el fondo deben medir entre 2 y 30 m.'); return }
    setForm(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="catalogo">
      <div className="flex shrink-0 flex-col gap-2 px-panel-pad pb-2 pt-3">
        <Segmented<Lib>
          label="Biblioteca"
          value={lib}
          onChange={setLib}
          className="w-full [&>button]:flex-1"
          items={[{ key: 'gfit', label: `Biblioteca GFit · ${gfit.length}` }, { key: 'mia', label: `Mi biblioteca · ${mia.length}` }]}
        />
        <div className="flex items-center gap-2">
          <select value={filtro ?? ''} onChange={(e) => setFiltro(e.target.value || null)} aria-label="Filtrar por tipo" data-testid="cat-filtro-tipo" className={`${campo} min-w-0 flex-1`}>
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="button" onClick={() => setForm(form ? null : { type: TIPOS[1].id, w: '7.2', d: '8.1' })} aria-expanded={!!form} data-testid="cat-nuevo" className="pressable flex h-[1.75rem] shrink-0 items-center gap-1 rounded-control bg-fill px-2.5 text-label text-ink hover:bg-hover">
            + Crear
          </button>
        </div>
        {form && (
          <div className="flex flex-col gap-2 rounded-control bg-panel-sunken p-2.5" data-testid="cat-form">
            <label className="flex items-center justify-between gap-2 text-label text-ink-secondary">Tipo
              <select value={form.type} className={campo} data-testid="cat-form-tipo" onChange={(e) => {
                const t = TIPOS.find((x) => x.id === e.target.value)!
                setForm({ ...form, type: t.id, w: ((t.wMin + t.wMax) / 2).toFixed(1) })
              }}>{TIPOS.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.wMin}–{t.wMax} m</option>)}</select>
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 items-center justify-between gap-2 text-label text-ink-secondary">Ancho <span className="flex items-center gap-1"><input inputMode="decimal" value={form.w} onChange={(e) => setForm({ ...form, w: e.target.value.replace(',', '.') })} data-testid="cat-form-w" className={`${campo} w-14 text-right tabular-nums`} /> m</span></label>
              <label className="flex flex-1 items-center justify-between gap-2 text-label text-ink-secondary">Fondo <span className="flex items-center gap-1"><input inputMode="decimal" value={form.d} onChange={(e) => setForm({ ...form, d: e.target.value.replace(',', '.') })} data-testid="cat-form-d" className={`${campo} w-14 text-right tabular-nums`} /> m</span></label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => enviar(false)} data-testid="cat-generar" className="pressable h-[1.75rem] flex-1 rounded-control bg-ink px-2.5 text-label text-on-ink">Generar con el motor</button>
              <button type="button" onClick={() => enviar(true)} data-testid="cat-manual" className="pressable h-[1.75rem] rounded-control bg-fill px-2.5 text-label text-ink hover:bg-hover">Vacío</button>
            </div>
          </div>
        )}
      </div>
      {lib === 'mia' && !mia.length && !form && (
        <p className="px-panel-pad text-caption text-ink-secondary">Mi biblioteca está vacía. «Crear» genera un departamento con el motor de GFit; en la Biblioteca GFit hay {gfit.length} listos para copiar.</p>
      )}
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-1 overflow-y-auto overscroll-contain px-2 pb-panel-pad">
        {list.map((c) => <Tarjeta key={c.id} c={c} />)}
      </div>
    </div>
  )
}
