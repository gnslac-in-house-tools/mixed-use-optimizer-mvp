// Un ícono de GIM: 16 × 16, trazo de 1.5, sin relleno (GIM `views/controls/Icon.tsx`).
import { ICONOS, type NombreIcono } from './iconos'

export function Icon({ name, className = 'h-4 w-4' }: { name: NombreIcono; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: ICONOS[name] }}
    />
  )
}

/** El botón cuadrado de 2 rem de las barras (GIM `controls/BarButtons.tsx#IconButton`). */
export function IconButton({ icon, label, title, onClick, pressed, disabled }: { icon: NombreIcono; label: string; title?: string; onClick?: () => void; pressed?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`pressable grid h-[2rem] w-[2rem] shrink-0 place-items-center rounded-control disabled:opacity-40 ${pressed ? 'bg-fill text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'}`}
    >
      <Icon name={icon} />
    </button>
  )
}

/** El segmentado de GIM (`controls/Segmented.tsx`): pastilla blanca sobre el relleno gris. */
export function Segmented<K extends string>({ label, items, value, onChange, className = '' }: { label: string; items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-0.5 rounded-segment bg-fill p-0.5 ${className}`}>
      {items.map((it) => {
        const on = it.key === value
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.key)}
            className={`pressable rounded-segment-pill px-2 py-1 text-body ${on ? 'bg-panel font-semibold text-ink shadow-control' : 'text-ink-segment hover:text-ink'}`}
          >
            <span className="inline-grid whitespace-nowrap">
              <span className="col-start-1 row-start-1 whitespace-nowrap">{it.label}</span>
              <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap font-semibold">{it.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Un interruptor de la barra de dibujo (Snap, Align, Ortho, Grid): pastilla dentro del relleno. */
export function Toggle({ label, on, onClick, disabled }: { label: string; on: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`pressable flex h-6 min-w-6 items-center justify-center gap-1 rounded-segment-pill px-2 text-label disabled:cursor-default disabled:hover:text-ink-segment ${on ? 'bg-panel text-ink shadow-control' : 'text-ink-segment hover:text-ink'}`}
    >
      {label}
    </button>
  )
}
