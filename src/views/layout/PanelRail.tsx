// A side panel's rail of tab icons (Decisions "Properties in the panel" and "Summary tabs"), down its outer edge, the
// whole height, as the side tabs of Rhino's panels: the Summary's on the right (the inner edge is the one that drags
// the width). The left panel has a row of tabs instead (layout/PanelTabs.tsx, Phase AS.3, Decision "Panel tabs"; it was a rail of areas, Decision "Areas rail"). Each icon names its tab in its tooltip; a count on it (what is
// selected, the issues) is in its name too. The plugins' tabs (Decision "Optimizer plugin") stand at the rail's end,
// under a short line, apart from the core's.
import { Fragment } from 'react'
import { Icon, type IconName } from '../controls/Icon.tsx'
import type { Side } from './ui.ts'

export interface RailTab<K extends string> {
  key: K
  label: string
  /** One of the core's icons, or a plugin's own path. */
  icon: IconName | { path: string }
  /** A count on the icon, and in the tab's name ("Properties, 2 selected"); `alert` draws it red. Absent: none. */
  badge?: { count: number; words: string; alert?: boolean }
  /** At the rail's end, apart (a plugin's tab). */
  end?: boolean
  /** Not built yet (the roadmap step that does): the rail skips it (Decision "Only what works is shown"). */
  phase?: string
}

export function PanelRail<K extends string>(props: { label: string; side: Side; tabs: RailTab<K>[]; active: K; onPick(key: K): void }) {
  const { label, side, active, onPick } = props
  const tabs = props.tabs.filter((t) => t.phase === undefined)
  const firstEnd = tabs.findIndex((t) => t.end)
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="vertical"
      className={`flex w-side-rail shrink-0 flex-col items-center gap-1 border-separator py-3 ${side === 'left' ? 'border-r' : 'border-l'}`}
    >
      {tabs.map((t, i) => {
        const on = t.key === active
        const b = t.badge && t.badge.count > 0 ? t.badge : null
        const button = (
          <button
            key={t.key}
            type="button"
            data-tour={`${props.label.toLowerCase()}-${t.key}`}
            role="tab"
            aria-selected={on}
            aria-label={b ? `${t.label}, ${b.words}` : t.label}
            title={b ? `${t.label} (${b.words})` : t.label}
            onClick={() => onPick(t.key)}
            className={`pressable relative grid h-9 w-9 place-items-center rounded-control ${
              on ? 'bg-fill text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'
            }`}
          >
            {typeof t.icon === 'string' ? (
              <Icon name={t.icon} className="h-[1.125rem] w-[1.125rem]" />
            ) : (
              <Icon path={t.icon.path} className="h-[1.125rem] w-[1.125rem]" />
            )}
            {b && (
              <span
                aria-hidden
                data-badge={b.count}
                className={`absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-pill px-1 text-caption leading-none text-on-ink ${
                  b.alert ? 'bg-status-over' : 'bg-ink'
                }`}
              >
                {b.count}
              </span>
            )}
          </button>
        )
        if (i !== firstEnd) return button
        return (
          <Fragment key={t.key}>
            <div aria-hidden className="mt-auto mb-1 h-px w-5 bg-separator" />
            {button}
          </Fragment>
        )
      })}
    </div>
  )
}
