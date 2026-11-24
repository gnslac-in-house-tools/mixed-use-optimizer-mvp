// The buttons the block editor's tools are made of (moved out of the ribbon, Phase Q.6): a tool with its icon over its name, a
// group of tools with its caption under it, groups side by side (modules/warehouse/views/WarehouseTools.tsx, ProgramWindow.tsx).
// The project's tools are the Tools strip's (ToolStrip.tsx), built from the commands.
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../controls/Icon.tsx'
import { useCompactBar } from '../viewport/DockedBar.tsx'

export const Separator = () => <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-separator" />

/** A group of tools with its caption under it (Revit's panel). `label`: its name for screen readers, if not the caption. */
export function Group({ caption, label, dim = false, children }: { caption: string; label?: string; dim?: boolean; children: ReactNode }) {
  return (
    <div role="group" aria-label={label ?? caption} className="flex shrink-0 flex-col items-center justify-between gap-0.5 px-0.5">
      <div className={`flex flex-1 items-center gap-0.5 ${dim ? 'opacity-50' : ''}`}>{children}</div>
      <span aria-hidden data-caption className="text-caption leading-none text-ink-tertiary">
        {caption}
      </span>
    </div>
  )
}

/**
 * A tool: its icon over its name, or, short of room, its icon alone (the name in the tooltip). `pressed`: a mode it
 * turns on (absent: a command). `phase`: not built until that roadmap step
 * does, so it is not drawn (Decision "Only what works is shown").
 */
export function ToolButton(props: { icon: IconName | { path: string }; label: string; title: string; phase?: string; pressed?: boolean; disabled?: boolean; /** its title says why it is off */ why?: boolean; /** a guided tour's anchor */ tour?: string; onClick(): void }) {
  const { pressed, disabled = false } = props
  const compact = useCompactBar()
  if (props.phase) return null
  const title = props.title
  return (
    <button
      type="button"
      data-tour={props.tour}
      aria-pressed={pressed}
      title={disabled && !props.why ? `${title} · on the plan` : title}
      disabled={disabled}
      onClick={props.onClick}
      className={`pressable flex shrink-0 items-center justify-center rounded-control text-caption ${
        compact ? 'h-[2rem] w-[2rem]' : 'h-11 min-w-[2.75rem] flex-col gap-0.5 px-1.5'
      } ${
        pressed && !disabled ? 'bg-fill font-semibold text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'
      } disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-segment`}
    >
      <Icon {...(typeof props.icon === 'string' ? { name: props.icon } : props.icon)} className="h-[1.5rem] w-[1.5rem]" />
      {compact ? <span className="sr-only">{props.label}</span> : <span className="whitespace-nowrap">{props.label}</span>}
    </button>
  )
}
