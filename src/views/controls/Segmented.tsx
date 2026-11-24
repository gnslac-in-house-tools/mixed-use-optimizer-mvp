// The macOS segmented control: a grey rail and a white pill under the active option. Port of Plaza-Practiko
// `vistas/comunes/Segmented.tsx`. The active state does not depend on colour (pill against rail is 1.22:1): the
// shadow, the weight and the ink carry it. On a phone each option is at least 40 px tall, for the finger.
import { Fragment } from 'react'
import { Icon, type IconName } from './Icon.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export type SegmentedOption<K extends string> = {
  key: K
  label: string
  disabled?: boolean
  title?: string
  icon?: IconName
}

type Props<K extends string> = {
  /** tabs: switches what is shown (a tablist). toggle: switches a mode (buttons with aria-pressed). */
  kind: 'tabs' | 'toggle'
  label: string
  options: SegmentedOption<K>[]
  value: K
  onChange: (key: K) => void
  /** glass: the control floats over the viewport and its inactive text uses the glass ink. */
  surface?: 'panel' | 'glass'
  /** Shares the full width between the options. */
  stretch?: boolean
  /** vertical: the options stacked, aligned left. */
  orientation?: 'horizontal' | 'vertical'
  /** A sequence (the workspace switch's steps): a small chevron between the options says what comes next. */
  flow?: boolean
}

export function Segmented<K extends string>({
  kind,
  label,
  options,
  value,
  onChange,
  surface = 'panel',
  stretch = false,
  flow = false,
  orientation = 'horizontal',
}: Props<K>) {
  const inactive = surface === 'glass' ? 'text-ink-glass' : 'text-ink-segment'
  const vertical = orientation === 'vertical'

  return (
    <div
      role={kind === 'tabs' ? 'tablist' : 'group'}
      aria-label={label}
      aria-orientation={kind === 'tabs' && vertical ? 'vertical' : undefined}
      className={`flex gap-0.5 rounded-segment p-0.5 ${vertical ? 'flex-col' : ''} ${surface === 'glass' ? 'glass' : 'bg-fill'} ${
        stretch ? (vertical ? 'h-full' : 'w-full') : ''
      }`}
    >
      {options.map((o, i) => {
        const active = o.key === value
        return (
          <Fragment key={o.key}>
          {flow && i > 0 && <Icon name="chevronRight" className="h-3 w-3 shrink-0 self-center text-ink-tertiary" />}
          <button
            type="button"
            role={kind === 'tabs' ? 'tab' : undefined}
            aria-selected={kind === 'tabs' ? active : undefined}
            aria-pressed={kind === 'toggle' ? active : undefined}
            disabled={o.disabled}
            title={o.title}
            className={`pressable rounded-segment-pill ${kind === 'tabs' ? 'px-2 py-1' : 'px-3 py-1'} text-body phone:min-h-10 ${
              stretch ? 'flex-1' : ''
            } ${vertical ? 'flex items-center gap-2 text-left' : ''} ${
              active ? 'bg-panel font-semibold text-ink shadow-control' : `${inactive} hover:text-ink`
            } ${o.disabled ? 'cursor-default opacity-40 hover:text-ink-segment' : ''}`}
            onClick={() => onChange(o.key)}
          >
            {o.icon && vertical && <Icon name={o.icon} className="h-4 w-4 shrink-0" />}
            {/* Two layers in one cell: the visible label and an invisible bold copy that fixes the width, so the
                active option does not grow and push its neighbours. nowrap on both keeps a centred control on
                one line. */}
            <span className="inline-grid whitespace-nowrap">
              <span className="col-start-1 row-start-1 whitespace-nowrap">{tr(o.label)}</span>
              <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap font-semibold">
                {tr(o.label)}
              </span>
            </span>
          </button>
          </Fragment>
        )
      })}
    </div>
  )
}
