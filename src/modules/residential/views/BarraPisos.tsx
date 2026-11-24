// La barra de pisos de uso mixto, flotando abajo a la izquierda del viewport: Tipo, cada nivel que deriva GFit (con sus
// departamentos) y el sótano tipo con sus cajones. Elige qué piso dibujan la planta y el 3D (`usePiso`).
import { buildingOfLevel } from '../../../engine/buildings.ts'
import { useApp } from '../../../state/store.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { useDetail } from '../../../views/detail.ts'
import { usePiso, type Piso } from './piso.ts'
import { useDerivado } from './useDerivado.ts'

const boton = (activo: boolean) =>
  `pressable rounded-control px-1.5 py-0.5 text-caption tabular-nums ${activo ? 'bg-ink text-on-ink' : 'text-ink-secondary hover:bg-hover'}`

export function BarraPisos() {
  const project = useShown((s) => s.project)
  const level = useApp((s) => s.level)
  const d = useDerivado(buildingOfLevel(project, level)?.id)
  const piso = usePiso((s) => s.piso)
  const fija = usePiso((s) => s.set)
  // un piso o el sótano se ven por dentro: las masas pasan a Ghosted (translúcidas) para que se lean los departamentos
  const set = (p: Piso) => { fija(p); if (p !== null) useDetail.getState().setDetail('ghosted') }
  if (!d) return null
  const n = d.niveles.length
  const actual: Piso = typeof piso === 'number' && piso >= n ? null : piso
  const e = d.estacionamiento
  const mover = (k: number) => {
    const i = typeof actual === 'number' ? actual : actual === 'sotano' ? -1 : 0
    const j = Math.max(-1, Math.min(n - 1, i + k))
    set(j < 0 ? (e.sotanos ? 'sotano' : 0) : j)
  }
  const info =
    actual === 'sotano'
      ? `${e.sotanos} sótano${e.sotanos === 1 ? '' : 's'} · ${e.porSotano} cajones c/u · ${e.cajones} de ${e.requeridos}`
      : typeof actual === 'number'
        ? `${d.niveles[actual].name} · ${d.niveles[actual].prog === 'ret' ? 'Comercio' : `${d.niveles[actual].units} deptos`}`
        : 'Planta tipo'
  return (
    <div className="glass pointer-events-auto absolute bottom-4 left-4 z-10 flex max-w-[70%] flex-col gap-1 rounded-glass p-2" role="toolbar" aria-label="Pisos de uso mixto">
      <div className="flex items-center gap-1">
        <button type="button" className={boton(false)} aria-label="Piso de abajo" onClick={() => mover(-1)}>▼</button>
        <button type="button" className={boton(actual === null)} onClick={() => set(null)}>Tipo</button>
        {e.sotanos > 0 && <button type="button" className={boton(actual === 'sotano')} onClick={() => set('sotano')}>S{e.sotanos > 1 ? `1–${e.sotanos}` : '1'}</button>}
        <div className="flex flex-wrap items-center gap-0.5">
          {d.niveles.map((l, i) => (
            <button key={i} type="button" className={boton(actual === i)} title={`${l.name}: ${l.prog === 'ret' ? 'Comercio' : `${l.units} departamentos`}`} onClick={() => set(i)}>
              {i + 1}
            </button>
          ))}
        </div>
        <button type="button" className={boton(false)} aria-label="Piso de arriba" onClick={() => mover(1)}>▲</button>
      </div>
      <p className="px-1 text-caption text-ink-secondary" data-piso-info>{info}</p>
    </div>
  )
}
