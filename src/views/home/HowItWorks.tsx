// Home's bottom strip (Decision "Home"): how GFit works in three small cards — the three ways to model — and, a little
// apart, the sample project with its tour, as wide as two of them. Short of room (a narrow window, or the summary
// open) the sample takes a row of its own under them, rather than squeezing.
import { isSoon, usePluginModes } from '../../plugins/index.ts'
import { Icon } from '../controls/Icon.tsx'
import { openSample } from '../layout/files.ts'
import { HOME_ICONS } from './icons.ts'
import { Badge, Thumb } from './ProjectsTable.tsx'
import type { Row } from './rows.ts'

/** `plugin`: held back as "coming soon" (Decision "Coming soon") the card says so; `off`: not in the sample either. */
const WAYS: { title: string; text: string; icon: string; tint: string; off?: boolean; plugin?: string }[] = [
  { title: 'By hand', text: 'Drag, stretch and rotate buildings. Roads, docks and platforms follow.', icon: HOME_ICONS.hand, tint: 'bg-earth-soft text-earth' },
  { title: 'Optimizer', text: 'Say what may change and what to aim for; it searches options that keep every rule.', icon: HOME_ICONS.optimizer, tint: 'bg-grid-soft text-grid-line', plugin: 'optimizer' },
  { title: 'Agent', text: 'Ask in words; it runs the same tools, one undo step each.', icon: HOME_ICONS.agent, tint: 'bg-fill text-ink-tertiary', off: true, plugin: 'agent' },
]

export function HowItWorks({ sample, blocks, narrow }: { sample: Row; blocks: number; narrow: boolean }) {
  const s = sample.summary
  const soon = usePluginModes((m) => m.soon)
  return (
    <section
      aria-label="How it works"
      className={`grid shrink-0 grid-cols-[3fr_2fr] gap-5 phone:grid-cols-1 phone:gap-2 ${narrow ? '[@media(max-width:1564px)]:grid-cols-1 [@media(max-width:1564px)]:gap-2.5' : '[@media(max-width:1180px)]:grid-cols-1 [@media(max-width:1180px)]:gap-2.5'}`}
    >
      <ul aria-label="Three ways to model" className="grid grid-cols-3 gap-2.5 phone:grid-cols-1">
        {WAYS.map((way) => {
          const coming = !!way.plugin && isSoon(soon, way.plugin)
          const w = { ...way, off: way.off || coming }
          return (
          <li key={w.title} className="panel grid min-w-0 grid-cols-[1.875rem_1fr] content-start gap-x-2.5 gap-y-1 p-3">
            <span className={`row-span-2 grid h-[1.875rem] w-[1.875rem] place-items-center rounded-[0.5625rem] ${w.tint}`}>
              <Icon path={w.icon} className="h-4 w-4" />
            </span>
            <span className={`flex min-h-[1.875rem] flex-wrap items-center gap-x-1.5 gap-y-0.5 text-body font-semibold ${w.off ? 'text-ink-tertiary' : 'text-ink'}`}>
              {w.title}
              {w.off && <span className="whitespace-nowrap rounded-pill bg-fill px-2 text-caption font-semibold leading-[1.125rem] text-ink-segment">{coming ? 'Coming soon' : 'Not in this demo'}</span>}
            </span>
            <span className={`col-start-2 text-label font-normal ${w.off ? 'text-ink-tertiary' : 'text-ink-secondary'}`}>{w.text}</span>
          </li>
          )
        })}
      </ul>
      <section aria-label="Sample project" data-tour="home-sample" className="panel flex min-w-0 items-center gap-3.5 p-2.5">
        <Thumb
          svg={s?.options[0]?.thumb ?? sample.thumb}
          className="h-20 w-24 bg-[radial-gradient(var(--grid-line)_0.6px,transparent_0.8px)] bg-[length:10px_10px] p-0"
        />
        <div className="min-w-0">
          <h3 className="flex items-center text-headline text-ink">
            {sample.name}
            <Badge />
          </h3>
          <p className="mt-1 flex flex-wrap gap-x-3 text-label font-normal text-ink-secondary">
            {s?.hectares != null && (
              <span>
                <b className="font-semibold tabular-nums text-ink">{s.hectares.toFixed(1)}</b> ha
              </span>
            )}
            {s?.fall != null && (
              <span>
                <b className="font-semibold tabular-nums text-ink">{s.fall} m</b> fall
              </span>
            )}
            <span>
              <b className="font-semibold text-ink">{blocks}</b> smart blocks
            </span>
            <span>
              <b className="font-semibold text-ink">{sample.options}</b> options
            </span>
          </p>
          <div className="-ml-2.5 mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => openSample({ fresh: true, tour: true })}
              className="pressable ml-2.5 flex h-[1.875rem] items-center gap-2 whitespace-nowrap rounded-[0.625rem] bg-panel px-2.5 text-label font-semibold text-ink shadow-control hover:bg-panel-sunken"
            >
              <Icon path={HOME_ICONS.tour} className="h-4 w-4" />
              Take the tour · 10 min
            </button>
            <button
              type="button"
              aria-label="Open the sample"
              onClick={() => openSample()}
              className="pressable flex h-[1.875rem] items-center gap-2 rounded-[0.625rem] px-2.5 text-label text-ink-segment hover:bg-hover hover:text-ink"
            >
              <Icon path={HOME_ICONS.open} className="h-4 w-4" />
              Open
            </button>
          </div>
        </div>
      </section>
    </section>
  )
}
