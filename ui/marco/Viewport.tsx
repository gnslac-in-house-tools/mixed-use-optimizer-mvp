// El viewport (GIM `views/viewport/Viewport.tsx`): una hoja hundida con la vista elegida en la barra de dibujo —
// Planta (el plano grande), 3D (el motor de Praktico) o Dividida (las dos) —, el nivel arriba a la derecha y Encuadrar
// abajo a la derecha, en vidrio.
import { useMemo } from 'react'
import { PlanoUnidad } from '../PlanMini'
import { planDe, useApp } from '../store'
import { Escena } from '../tresd/Escena'
import { ALTO_MURO, Unidad3d, cajaDePlan } from '../tresd/Unidad3d'
import { Icon } from './Icon'
import { encuadre, useUi } from './ui'

const ALTO_CORTE = 1.2

function Vista3d() {
  const plan = useApp((s) => planDe(s, s.sel))
  const detalle = useUi((s) => s.detalle)
  const caja = useMemo(() => cajaDePlan(plan), [plan])
  return (
    <Escena caja={caja} clave={plan?.id ?? ''}>
      {plan && <Unidad3d plan={plan} alto={detalle === 'completo' ? ALTO_MURO : ALTO_CORTE} muebles={detalle !== 'esquema'} />}
    </Escena>
  )
}

function VistaPlanta() {
  const plan = useApp((s) => planDe(s, s.sel))
  const detalle = useUi((s) => s.detalle)
  if (!plan) return null
  return (
    <div className="grid h-full w-full place-items-center p-8">
      <PlanoUnidad p={plan} muebles={detalle !== 'esquema'} />
    </div>
  )
}

export function Viewport() {
  const vista = useUi((s) => s.vista)
  const plan = useApp((s) => planDe(s, s.sel))
  return (
    <section className="panel relative h-full min-h-0 overflow-hidden bg-panel-sunken" aria-label="Viewport">
      <div className="relative isolate flex h-full min-h-0">
        {(vista === 'plan' || vista === 'split') && (
          <div className={`relative min-w-0 flex-1 overflow-hidden ${vista === 'split' ? 'border-r border-separator' : ''}`}><VistaPlanta /></div>
        )}
        {(vista === '3d' || vista === 'split') && (
          <div className="relative min-w-0 flex-1 overflow-hidden"><Vista3d /></div>
        )}
      </div>
      {!plan && <p className="pointer-events-none absolute inset-0 grid place-items-center text-body text-ink-secondary">Elige un plano del catálogo.</p>}
      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2">
        <button type="button" aria-label="Encuadrar el modelo" title="Encuadrar el modelo (Z)" disabled={vista === 'plan'} onClick={() => encuadre.ir?.()} className="glass pressable pointer-events-auto grid h-[2rem] w-[2rem] place-items-center text-ink shadow-control hover:bg-hover disabled:opacity-40">
          <Icon name="frameTheModel" />
        </button>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 flex items-start gap-2">
        <div role="tablist" aria-label="Nivel" aria-orientation="vertical" className="glass pointer-events-auto flex flex-col gap-0.5 rounded-segment p-0.5">
          <button type="button" role="tab" aria-selected className="pressable flex items-center gap-2 rounded-segment-pill bg-panel px-2 py-1 text-left text-body font-semibold text-ink shadow-control">N1</button>
        </div>
      </div>
    </section>
  )
}
