// Home's summary (Decision "Home"; data on the right, as in the editor): a brief look at the picked project, on the
// option it was left in, any other a pick away; each figure set against the project's other options (one dot an
// option, smaller to the left, this one dark), the ground's profile, the option's issues. Open in <option> is the one
// filled button on Home. Read from the summary kept with the project (summary.ts): nothing is measured here.
import { useState } from 'react'
import type { Id } from '../../model/schema.ts'
import type { OptionSummary, Summary } from '../../io/library.ts'
import { TYPOLOGIES } from '../../typologies/index.ts'
import { Icon } from '../controls/Icon.tsx'
import { IconButton } from '../controls/BarButtons.tsx'
import { formatFigure } from '../format.ts'
import { duplicateKept, openKept, openSample, removeKept, resetSample, saveKept } from '../layout/files.ts'
import { useToast } from '../layout/toast.ts'
import { HOME_ICONS } from './icons.ts'
import { Thumb } from './ProjectsTable.tsx'
import type { Row } from './rows.ts'
import { optionShown } from './summary.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** Where `o` stands among the options on figure `id`: one dot an option, lowest left; its own dark. */
function Against({ s, o, id }: { s: Summary; o: OptionSummary; id: string }) {
  const values = s.options.flatMap((x) => {
    const f = x.figures.find((y) => y.id === id)
    return f ? [{ id: x.id, value: f.value }] : []
  })
  if (values.length < 2) return <span />
  values.sort((a, b) => a.value - b.value)
  return (
    <span aria-hidden className="relative flex h-4 items-center justify-end gap-[0.3125rem] before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-dashed before:border-separator">
      {values.map((v) => (
        <i key={v.id} className={`relative rounded-pill ${v.id === o.id ? 'h-[0.5625rem] w-[0.5625rem] bg-ink' : 'h-[0.4375rem] w-[0.4375rem] bg-fill'}`} />
      ))}
    </span>
  )
}

/** The ground along the site, as columns of dots (six a column, the highest full). */
function Ground({ profile }: { profile: number[] }) {
  const lo = Math.min(...profile)
  const hi = Math.max(...profile)
  const level = (z: number) => 1 + Math.round((5 * (z - lo)) / (hi - lo || 1))
  return (
    <div aria-hidden className="flex items-end justify-between py-1 text-earth-dot">
      {profile.map((z, i) => (
        <span key={i} className="flex flex-col-reverse gap-0.5">
          {Array.from({ length: 6 }, (_, k) => (
            <i key={k} className={`h-1 w-1 rounded-pill bg-current ${k < level(z) ? '' : 'opacity-[0.14]'}`} />
          ))}
        </span>
      ))}
    </div>
  )
}

const short = (name: string) => name.split(' · ')[0]

export function ProjectSummary({ row, close, changed }: { row: Row; close: () => void; changed: () => void }) {
  const s = row.summary
  const [chosen, setChosen] = useState<Id | null>(null)
  const [menu, setMenu] = useState(false)
  const o = s ? s.options.find((x) => x.id === chosen) ?? optionShown(s, row.option) : null
  const last = s ? optionShown(s, row.option).id : null
  const kind = row.sample ? 'Sample project' : TYPOLOGIES.find((t) => t.id === row.typology)?.name ?? row.typology
  const quiet = 'pressable flex h-[1.875rem] items-center rounded-[0.625rem] px-3 text-label text-ink-segment hover:bg-hover hover:text-ink'

  const open = () => {
    if (row.sample) return openSample({ option: o?.id ?? null })
    if (!openKept(row.id, o?.id ?? null)) useToast.getState().show('error', `Could not open “${row.name}”: this browser’s copy does not read.`)
  }
  const remove = () =>
    useToast.getState().confirm(`Remove “${row.name}” from this browser? Export it as .gft first to keep it.`, () => {
      removeKept(row.id)
      close()
      changed()
    })
  const reset = () =>
    useToast.getState().confirm('Forget what was changed in the sample project in this browser?', () => {
      resetSample()
      changed()
    })

  return (
    <div className="flex h-full w-[24rem] flex-col gap-3 overflow-y-auto px-5 pb-4 pt-4 [&>*]:shrink-0">
      <header className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-caption font-semibold uppercase tracking-[0.07em] text-ink-tertiary">{kind}</div>
          <h2 className="mt-0.5 truncate text-headline text-ink">{row.name}</h2>
        </div>
        <IconButton icon="close" label="Close the summary" title={tr("Close (Esc)")} onClick={close} />
      </header>

      {s && o ? (
        <>
          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-label={`Option: ${o.name}`}
              onClick={() => setMenu(!menu)}
              className="pressable flex w-full items-center gap-2.5 rounded-[0.625rem] bg-fill px-3 py-2 text-left text-label font-semibold text-ink"
            >
              <Icon path={HOME_ICONS.list} className="h-4 w-4" />
              <span className="truncate">{o.name}</span>
              {o.id === last && <span className="ml-auto whitespace-nowrap text-caption font-medium text-ink-tertiary">open last</span>}
              <Icon name="chevronDown" className={`h-4 w-4 ${o.id === last ? '' : 'ml-auto'}`} />
            </button>
            {menu && (
              <div role="menu" className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-10 rounded-[0.75rem] bg-panel p-1 shadow-sheet">
                {s.options.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setChosen(x.id)
                      setMenu(false)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-label text-ink hover:bg-hover"
                  >
                    <Thumb svg={x.thumb} className="h-7 w-7" />
                    <span className="truncate">{x.name}</span>
                    {x.id === last && <span className="ml-auto whitespace-nowrap text-caption text-ink-tertiary">open last</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            aria-hidden
            className="grid max-h-60 min-h-24 !shrink place-items-center rounded-[0.875rem] bg-panel-sunken bg-[radial-gradient(var(--grid-line)_0.7px,transparent_0.9px)] bg-[length:14px_14px] shadow-[inset_0_0_0_1px_var(--separator)] [flex:1_1_13rem] [&>svg]:h-full [&>svg]:w-[86%]"
            dangerouslySetInnerHTML={{ __html: o.thumb ?? '' }}
          />

          {o.figures.length > 0 && (
            <div>
              <div className="flex justify-between text-caption font-semibold text-ink-tertiary">
                <span>{tr("Figures")}</span>
                {s.options.length > 1 && <span>against the other options</span>}
              </div>
              <dl className="mt-1">
                {o.figures.map((f) => (
                  <div key={f.id} className="grid grid-cols-[1fr_auto_4rem] items-center gap-3 border-b border-separator py-1.5 text-label font-normal last:border-b-0">
                    <dt className="text-ink-secondary">
                      {f.label}
                      {f.limit !== null && f.unit === 'pct' && ` · max ${Math.round(f.limit * 100)} %`}
                    </dt>
                    <dd className="text-right font-semibold tabular-nums text-ink">{formatFigure(f.value, f.unit)}</dd>
                    <Against s={s} o={o} id={f.id} />
                  </div>
                ))}
              </dl>
            </div>
          )}

          {s.profile.length > 1 && (
            <div>
              <div className="flex justify-between text-caption font-semibold text-ink-tertiary">
                <span>Ground{s.fall !== null && ` · ${s.fall} m fall`}</span>
                {s.hectares !== null && <span>{s.hectares.toFixed(1)} ha</span>}
              </div>
              <Ground profile={s.profile} />
            </div>
          )}

          {o.thumb ? (
            <div>
              <div className="text-caption font-semibold text-ink-tertiary">Issues · {o.errors + o.warnings}</div>
              <ul className="mt-1">
                {o.issues.map((t, i) => (
                  <li key={i} className="flex gap-2.5 py-0.5 text-label font-normal text-ink-secondary before:mt-1.5 before:h-[0.4375rem] before:w-[0.4375rem] before:shrink-0 before:rounded-pill before:bg-earth-dot">
                    {t}
                  </li>
                ))}
                {!o.issues.length && <li className="text-label font-normal text-ink-secondary">{tr("None in this option.")}</li>}
              </ul>
            </div>
          ) : (
            <p className="text-label font-normal text-ink-secondary">{tr("No site yet: open it to import a DXF or draw the site.")}</p>
          )}
        </>
      ) : (
        <p className="text-label font-normal text-ink-secondary">{tr("This browser’s copy does not read: export it as .gft from the editor, or remove it.")}</p>
      )}

      <div className="mt-auto flex gap-2 pt-1">
        <button type="button" onClick={open} className="pressable h-10 flex-1 rounded-[0.625rem] bg-ink px-3 text-label font-semibold text-on-ink hover:opacity-90">
          Open{o ? ` in ${short(o.name)}` : ''}
        </button>
        {row.sample && (
          <button
            type="button"
            aria-label="Take the tour"
            onClick={() => openSample({ fresh: true, tour: true })}
            className="pressable flex h-10 items-center gap-2 rounded-[0.625rem] bg-panel px-3 text-label font-semibold text-ink shadow-control hover:bg-panel-sunken"
          >
            <Icon path={HOME_ICONS.tour} className="h-4 w-4" />
            {tr("Tour")}
          </button>
        )}
      </div>
      <div className="flex justify-between gap-0.5 border-t border-separator pt-2">
        <button
          type="button"
          onClick={() => {
            duplicateKept(row.id, s)
            changed()
          }}
          className={quiet}
        >
          {tr("Duplicate")}
        </button>
        <button type="button" onClick={() => saveKept(row.id)} className={quiet}>
          {tr("Export .gft")}
        </button>
        {row.sample ? (
          row.savedAt !== null && (
            <button type="button" onClick={reset} className={quiet}>
              {tr("Reset")}
            </button>
          )
        ) : (
          <button type="button" onClick={remove} className={quiet}>
            {tr("Remove")}
          </button>
        )}
      </div>
    </div>
  )
}
