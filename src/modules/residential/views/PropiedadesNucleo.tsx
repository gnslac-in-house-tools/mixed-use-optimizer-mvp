// Un núcleo en sus Properties (spec 2026-11-26-blocks-residenciales): sus elementos (cada uno se gira o se quita, y se
// elige para verlo en la planta), agregar una escalera, un elevador, un ducto o un vestíbulo, y Reacomodar (vuelven
// al acomodo automático por su tamaño). Cada cambio es un paso de deshacer de GIM.
import type { Id } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { useApp } from '../../../state/store.ts'
import { agregarElemento, girarElemento, NOMBRES, nucleoColocado, quitarElemento, reacomodarNucleo, type KindNucleo } from '../engine/nucleoDetalle.ts'
import { useEdicionNucleo } from './edicionNucleo.ts'
import { usoDe } from './useDerivado.ts'

const boton = 'pressable rounded-control bg-fill px-2 py-1 text-label text-ink hover:bg-hover'
const chico = 'pressable rounded-control px-1.5 py-0.5 text-caption text-ink-secondary hover:bg-hover'
const KINDS: KindNucleo[] = ['escalera', 'elevador', 'ducto', 'vestibulo']

export function PropiedadesNucleo({ id }: { id: Id }) {
  const project = useApp((s) => s.project)
  const apply = useApp((s) => s.apply)
  const { elegido, elegir } = useEdicionNucleo()
  const m = project.masses.find((x) => x.id === id)
  const c = m && usoDe(project, id) === 'nucleo' ? nucleoColocado(m, footprintPolygon(m.footprint)) : null
  if (!m || !c) return null
  const locked = m.locked === true
  // el nombre de cada uno: «Elevador» si es el único de su clase, si no «Elevador 2»
  const nombre = (k: KindNucleo, eid: string) => {
    const mismos = c.elementos.filter((e) => e.kind === k)
    return mismos.length > 1 ? `${NOMBRES[k]} ${mismos.findIndex((e) => e.id === eid) + 1}` : NOMBRES[k]
  }
  return (
    <section aria-label="Núcleo" className="flex flex-col gap-2">
      <h3 className="text-label text-ink-secondary">Núcleo · {c.W.toFixed(2)} × {c.D.toFixed(2)} m</h3>
      <p className="text-caption text-ink-secondary">
        {c.propios ? 'Acomodo propio.' : 'Acomodo automático por su tamaño.'} En la planta, arrastra un elemento para moverlo; doble clic lo gira.
      </p>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {c.elementos.map((e) => {
          const n = nombre(e.kind, e.id)
          return (
            <li key={e.id} className={`flex items-center gap-1 rounded-control px-1 ${elegido === e.id ? 'bg-hover' : ''}`}>
              <button type="button" className="pressable min-w-0 flex-1 truncate text-left text-label text-ink" onClick={() => elegir(e.id)}>
                {n} <span className="text-caption text-ink-secondary">{e.w.toFixed(1)} × {e.d.toFixed(1)}{e.rot ? ` · ${e.rot}°` : ''}</span>
              </button>
              <button type="button" aria-label={`Girar ${n}`} title="Girar 90°" disabled={locked} className={chico} onClick={() => apply((p) => girarElemento(p, id, e.id))}>↻</button>
              <button type="button" aria-label={`Quitar ${n}`} title="Quitar" disabled={locked} className={chico} onClick={() => apply((p) => quitarElemento(p, id, e.id))}>✕</button>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <button key={k} type="button" aria-label={`Agregar ${NOMBRES[k].toLowerCase()}`} disabled={locked} className={boton} onClick={() => apply((p) => agregarElemento(p, id, k))}>
            + {NOMBRES[k]}
          </button>
        ))}
        {c.propios && <button type="button" disabled={locked} className={boton} onClick={() => apply((p) => reacomodarNucleo(p, id))}>Reacomodar</button>}
      </div>
    </section>
  )
}
