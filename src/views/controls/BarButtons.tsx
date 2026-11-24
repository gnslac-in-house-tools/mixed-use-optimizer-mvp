// The top bar buttons: with text (below lg, `short` keeps only the icon) or icon only. Port of Plaza-Practiko
// `vistas/paneles/BotonesBarra.tsx`.
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon.tsx'

export function TextButton({
  icon,
  children,
  title,
  pressed,
  short = false,
  onClick,
}: {
  icon?: IconName
  children: ReactNode
  title?: string
  pressed?: boolean
  /** Below lg only the icon shows; the name stays for screen readers. */
  short?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      className={`pressable flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 py-1.5 text-body font-medium hover:bg-hover ${
        pressed ? 'bg-fill' : ''
      }`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      {short ? <span className="sr-only lg:not-sr-only">{children}</span> : children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  title,
  pressed,
  disabled = false,
  tour,
  onClick,
}: {
  icon: IconName
  label: string
  title: string
  /** Absent: not a switch, no `aria-pressed` (a button that does something once). */
  pressed?: boolean
  disabled?: boolean
  /** A guided tour's anchor (`data-tour`). */
  tour?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      aria-pressed={pressed}
      data-tour={tour}
      disabled={disabled}
      className={`pressable grid h-[2rem] w-[2rem] shrink-0 place-items-center rounded-control disabled:opacity-40 ${
        pressed ? 'bg-fill text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'
      }`}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}
