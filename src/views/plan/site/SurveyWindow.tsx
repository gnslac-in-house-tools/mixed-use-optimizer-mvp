// The survey window (Decision "Site file survey"): a drawing (DXF) or a table of points (CSV) being imported, beside
// the plan where it is drawn. 1 Units and coordinates · 2 Layers, what each is (a table: Columns, which is x, y and z)
// · 3 Boundary (one shape is used; several, one is clicked on the plan) and the ground it brings; at its foot *Start
// from* (the site's file's setup, or one remembered), *Remember this setup*, Cancel and Import (one undo step). A row
// under the pointer draws its layer strong on the plan; Escape cancels. Top left of the viewport, on glass.
// The layers (Decision "Survey layers deleted"; the user: "let me select several with Shift and delete them, instead of
// Ignore"): a click picks a row, Shift a run, Ctrl (⌘) one more; Delete (the key, or the bar's button) takes the
// picked out of the import, and a kind chosen on a picked row goes to all of them. What is deleted (and what no name
// or content says what it is) waits under the list: *N deleted · Restore*.
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { isZone } from '../../../engine/geo/utm.ts'
import { LENGTH_UNITS, type LengthUnit } from '../../../model/schema.ts'
import { canBe, LAYER_KINDS, REFERENCE_KINDS, type LayerKind, type LayerSurvey } from '../../../io/site/survey.ts'
import { useApp } from '../../../state/store.ts'
import { Icon } from '../../controls/Icon.tsx'
import { Segmented } from '../../controls/Segmented.tsx'
import { importable, useSiteImport, zoneGuess, type SurveyImport } from './importState.ts'
import { THUMB } from './surveyPreview.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

const KIND_LABEL: Record<LayerKind, string> = {
  boundary: 'Boundary',
  parcels: 'Parcels',
  contours: 'Contours',
  points: 'Points',
  roads: 'Existing roads',
  reference: 'Reference',
  ignore: 'Deleted',
}
const NEEDS: Record<LayerKind, string> = {
  boundary: 'a closed shape',
  parcels: 'a closed shape',
  contours: 'lines',
  points: 'points, 3D lines or spot heights',
  roads: 'lines',
  reference: 'lines',
  ignore: '',
}
/** The kinds a row offers: deleting is the list's (Delete), not a kind; a drawing for its references, only theirs. */
const kindsFor = (s: Pick<SurveyImport, 'brings'>) => (s.brings === 'references' ? REFERENCE_KINDS : LAYER_KINDS).filter((k) => k !== 'ignore')
const INPUT = 'h-row rounded-control border border-separator bg-panel-sunken px-1.5 text-label tabular-nums text-ink outline-none focus:border-ink'
const BUTTON = 'pressable h-row shrink-0 rounded-control px-3 text-label text-ink hover:bg-hover'

const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const plural = (k: number, one: string) => `${k.toLocaleString('en-US')} ${one}${k === 1 ? '' : 's'}`

function Step({ n: i, title, children, tour }: { n: number; title: string; children: ReactNode; tour?: string }) {
  return (
    <section data-tour={tour} className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5 text-label font-semibold text-ink">
        <span aria-hidden className="grid h-4 w-4 place-items-center rounded-pill bg-ink text-[0.625rem] text-on-ink">
          {i}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** What a layer holds, in words: its shapes, lines, points, texts, and its heights or "all at 0". */
function holds(l: LayerSurvey, units: string): string {
  const parts = [
    l.shapes ? plural(l.shapes, 'closed shape') : '',
    l.lines ? plural(l.lines, 'line') : '',
    l.curves ? plural(l.curves, 'arc') : '',
    l.points ? plural(l.points, 'point') : '',
    l.labels ? plural(l.labels, 'spot height') : '',
    l.texts > l.labels ? plural(l.texts - l.labels, 'text') : '',
  ].filter(Boolean)
  const ground = l.lines + l.points > 0
  const heights = l.heights ? `${n(l.heights.min)}–${n(l.heights.max)} ${units}` : ground ? 'all at 0' : ''
  return [parts.join(' · '), heights].filter(Boolean).join(' · ')
}

function Thumb({ path }: { path: string | undefined }) {
  return (
    <svg aria-hidden width={THUMB.w} height={THUMB.h} viewBox={`0 0 ${THUMB.w} ${THUMB.h}`} className="shrink-0 rounded-[0.25rem] bg-panel-sunken">
      {path ? (
        <path d={path} fill="none" stroke="var(--ink-secondary)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <text x={THUMB.w / 2} y={THUMB.h / 2 + 4} textAnchor="middle" fontSize={12} fill="var(--ink-tertiary)">
          T
        </text>
      )}
    </svg>
  )
}

/** What a layer brought back becomes: its guess (if offered), else the first kind offered it can be. */
const restored = (l: LayerSurvey, kinds: readonly LayerKind[]): LayerKind => (l.guess !== 'ignore' && kinds.includes(l.guess) ? l.guess : (kinds.find((k) => canBe(l, k)) ?? 'ignore'))

function Layers({ s }: { s: SurveyImport }) {
  const KINDS = kindsFor(s)
  const { setKinds, hoverLayer } = useSiteImport.getState()
  const [picked, setPicked] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const kindOf = (name: string) => s.choice.kinds[name] ?? 'ignore'
  const shown = s.layers.filter((l) => kindOf(l.name) !== 'ignore')
  const deleted = s.layers.filter((l) => kindOf(l.name) === 'ignore')
  const chosen = picked.filter((n) => shown.some((l) => l.name === n))

  const pick = (e: MouseEvent, name: string) => {
    if (e.shiftKey && anchor !== null) {
      const names = shown.map((l) => l.name)
      const [a, b] = [names.indexOf(anchor), names.indexOf(name)].sort((x, y) => x - y)
      setPicked(a < 0 ? [name] : names.slice(a, b + 1))
      return
    }
    setAnchor(name)
    if (e.ctrlKey || e.metaKey) setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))
    else setPicked([name])
  }
  const remove = () => {
    if (!chosen.length) return
    setKinds(Object.fromEntries(chosen.map((n) => [n, 'ignore'])))
    setPicked([])
  }
  const onKey = (e: ReactKeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && chosen.length && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault()
      remove()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {chosen.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-control bg-fill px-2 py-1 text-caption text-ink">
          <span>
            {chosen.length} picked · Shift a run, Ctrl one more
          </span>
          <button type="button" className={`${BUTTON} flex items-center gap-1 px-2`} title="Take them out of the import (Delete)" onClick={remove}>
            <Icon name="trash" className="h-3.5 w-3.5" />
            {tr("Delete")}
          </button>
        </div>
      )}
      <ul aria-label="Layers" aria-multiselectable tabIndex={0} role="listbox" className="flex flex-col outline-none" onPointerLeave={() => hoverLayer(null)} onKeyDown={onKey}>
        {shown.map((l) => {
          const on = chosen.includes(l.name)
          return (
            <li
              key={l.name}
              role="option"
              aria-selected={on}
              data-layer-row={l.name}
              className={`flex cursor-default select-none items-center gap-2 rounded-control px-1 py-1 ${on ? 'bg-fill ring-1 ring-ink' : s.hoverLayer === l.name ? 'bg-hover' : ''}`}
              onPointerEnter={() => hoverLayer(l.name)}
              onClick={(e) => pick(e, l.name)}
            >
              <Thumb path={s.thumbs[l.name]} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-label text-ink" title={l.name}>
                  {l.name}
                </span>
                <span className="truncate text-caption text-ink-glass">{holds(l, s.choice.units)}</span>
              </span>
              <select
                aria-label={`${l.name} is`}
                className={`${INPUT} w-[7rem]`}
                value={kindOf(l.name)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const kind = e.target.value as LayerKind
                  // a picked row's kind goes to every picked one that can be it
                  const to = on ? chosen.filter((n) => canBe(s.layers.find((x) => x.name === n)!, kind)) : [l.name]
                  setKinds(Object.fromEntries(to.map((n) => [n, kind])))
                }}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k} disabled={!canBe(l, k)} title={canBe(l, k) ? undefined : `It has no ${NEEDS[k]}`}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>
      {deleted.length > 0 && (
        <p className="flex items-center justify-between gap-2 px-1 text-caption text-ink-glass">
          <span title={deleted.map((l) => l.name).join(', ')}>
            {deleted.length} {deleted.length === 1 ? 'layer' : 'layers'} deleted or not read (nothing says what {deleted.length === 1 ? 'it is' : 'they are'})
          </span>
          <button
            type="button"
            className="pressable shrink-0 rounded-control px-1.5 underline underline-offset-2 hover:text-ink"
            title="Bring them back into the list, each as its guess or the first kind it can be"
            onClick={() => setKinds(Object.fromEntries(deleted.map((l) => [l.name, restored(l, KINDS)])))}
          >
            {tr("Restore")}
          </button>
        </p>
      )}
    </div>
  )
}

function Columns({ s }: { s: SurveyImport }) {
  if (s.file.kind !== 'table' || !s.columns) return null
  const { table } = s.file
  const cols = s.columns
  const { setColumns } = useSiteImport.getState()
  const layer = s.layers[0]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {(['x', 'y', 'z'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1 text-label text-ink-glass">
            {k}
            <select aria-label={`Column ${k}`} className={`${INPUT} max-w-[7rem]`} value={cols[k]} onChange={(e) => setColumns({ ...cols, [k]: Number(e.target.value) })}>
              {table.columns.map((c, i) => (
                <option key={i} value={i}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="text-caption text-ink-glass">{layer ? holds(layer, s.choice.units) : 'No row has x, y and z in these columns'}</p>
    </div>
  )
}

function Coordinates({ s }: { s: SurveyImport }) {
  const hasFrame = useApp((st) => !!st.project.site.frame)
  const { setUnits, setCoordinates } = useSiteImport.getState()
  const c = s.choice.coordinates
  const utm = c.kind === 'utm' ? c : null
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-label text-ink-glass">
        <span className="w-[5.5rem]">{tr("Units")}</span>
        <select aria-label="Units" className={INPUT} value={s.choice.units} onChange={(e) => setUnits(e.target.value as LengthUnit)}>
          {LENGTH_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {s.file.kind === 'drawing' && <span className="text-caption">{s.fileUnits ? `the file says ${s.fileUnits}` : 'the file does not say'}</span>}
      </label>
      {s.unitsOverridden && s.choice.units === s.unitsGuess && (
        <p className="text-caption text-ink-glass">Read in {s.unitsGuess}: its numbers look like UTM in metres, not in {s.fileUnits}.</p>
      )}
      <div className="flex items-center gap-2 text-label text-ink-glass">
        <span className="w-[5.5rem] shrink-0">{tr("Coordinates")}</span>
        <Segmented
          kind="toggle"
          label="Coordinates"
          surface="glass"
          value={c.kind}
          options={[
            { key: 'utm', label: 'UTM', title: 'Drawn in real coordinates (UTM, WGS 84): the site comes georeferenced' },
            { key: 'local', label: 'Local', title: 'Drawn in its own coordinates: its middle at the plan’s origin (place it over the map afterwards)' },
            {
              key: 'site',
              label: 'As the site’s',
              disabled: !hasFrame,
              title: hasFrame ? 'In the coordinates of the site’s file: another file of the same survey lands on the site' : 'The site came from no file: nothing to land on',
            },
          ]}
          onChange={(k) => setCoordinates(k === 'utm' ? { kind: 'utm', ...(utm ?? zoneGuess(useApp.getState().project.site)) } : { kind: k })}
        />
      </div>
      {utm && (
        <div className="flex items-center gap-2 pl-[6rem] text-label text-ink-glass">
          <label className="flex items-center gap-1">
            {tr("Zone")}
            <input
              aria-label="UTM zone"
              type="number"
              min={1}
              max={60}
              className={`${INPUT} w-12`}
              value={utm.zone}
              onChange={(e) => {
                const zone = Number(e.target.value)
                if (isZone(zone)) setCoordinates({ ...utm, zone })
              }}
            />
          </label>
          <Segmented
            kind="toggle"
            label="Hemisphere"
            surface="glass"
            value={utm.south ? 's' : 'n'}
            options={[
              { key: 'n', label: 'N', title: 'North of the equator' },
              { key: 's', label: 'S', title: 'South of the equator' },
            ]}
            onChange={(k) => setCoordinates({ ...utm, south: k === 's' })}
          />
        </div>
      )}
      {s.utmLike && c.kind === 'local' && <p className="text-caption text-ink-glass">{tr("Its numbers look like UTM.")}</p>}
    </div>
  )
}

function Boundary({ s }: { s: SurveyImport }) {
  const hasBoundary = useApp((st) => st.project.site.boundary !== null)
  const { pick } = useSiteImport.getState()
  const k = s.candidates.length
  if (s.error) return <p className="text-caption text-status-over">{s.error}</p>
  if (k === 0) return <p className="text-caption text-ink-glass">No layer is the boundary: {hasBoundary ? 'the site keeps its own' : 'the site has none yet'}.</p>
  const picked = s.picked !== null ? s.candidates[s.picked] : null
  if (picked)
    return (
      <p className="text-caption text-ink-glass">
        <span className="text-ink">{picked.name}</span> · {n(Math.round(picked.area))} m²{k > 1 ? ' · another click on the plan changes it' : ''}
      </p>
    )
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-caption text-ink">{k} shapes: click the boundary on the plan</p>
      <button type="button" className={`${BUTTON} bg-fill`} title="Make the largest shape the boundary" onClick={() => pick(0)}>
        {tr("Use the largest")}
      </button>
    </div>
  )
}

function Ground({ s }: { s: SurveyImport }) {
  const terrain = useApp((st) => st.project.site.terrain)
  const r = s.read
  if (!r) return null
  const flat = r.contours.filter((c) => c.z === undefined).length
  const what = [r.contours.length ? plural(r.contours.length, 'contour') : '', r.points.length ? plural(r.points.length, 'point') : ''].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-0.5 text-caption text-ink-glass">
      <p>
        <span className="text-ink">Ground:</span> {what || 'none chosen: the site’s stays as it is'}
      </p>
      {flat > 0 && <p>{flat === r.contours.length ? 'Drawn flat' : `${flat} drawn flat`}: their heights are given on the plan afterwards (Heights).</p>}
      {what && terrain && <p>Replaces the site’s ground ({plural(terrain.contours.length, 'contour')}, {plural(terrain.points.length, 'point')}).</p>}
      {r.warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
    </div>
  )
}

/** What the file brings (Decision "Drawing layers"): the site and its ground, or references alone for the site there is. */
function Brings({ s }: { s: SurveyImport }) {
  if (!s.canReference) return null
  return (
    <div className="flex items-center gap-2 text-label text-ink-glass">
      <span className="w-[5.5rem] shrink-0">{tr("Brings")}</span>
      <Segmented
        kind="toggle"
        label="Brings"
        surface="glass"
        value={s.brings}
        options={[
          { key: 'site', label: 'Site & ground', title: 'The boundary, the ground and the roads, and its references (a new boundary replaces the site)' },
          { key: 'references', label: 'References', title: 'Only drawing lines and parcels, for the site there is: its boundary and ground stay' },
        ]}
        onChange={(k) => useSiteImport.getState().setBrings(k as SurveyImport['brings'])}
      />
    </div>
  )
}

/** The references and parcels it brings, and what they replace. */
function Kept({ s }: { s: SurveyImport }) {
  const drawings = useApp((st) => st.project.site.drawings)
  const r = s.read
  if (!r) return null
  const what = [r.references.length ? plural(r.references.length, 'reference layer') : '', r.parcels.length ? plural(r.parcels.length, 'parcel') : ''].filter(Boolean).join(' · ')
  if (!what && s.brings === 'site') return null
  const again = drawings?.some((d) => d.file === s.file.name)
  return (
    <p className="text-caption text-ink-glass">
      <span className="text-ink">References:</span> {what || 'none chosen'}
      {what && again ? ` · replaces those of ${s.file.name}` : ''}
    </p>
  )
}

function Foot({ s }: { s: SurveyImport }) {
  const { startFrom, setRemember, cancel, commit } = useSiteImport.getState()
  const ok = importable(s)
  const drawing = s.file.kind === 'drawing'
  const why = !s.read ? s.error ?? '' : s.candidates.length > 1 && s.picked === null ? 'Click the boundary on the plan first, or Use the largest' : 'Choose a layer to import'
  return (
    <div className="flex flex-col gap-2 border-t border-separator px-3 py-2">
      {drawing && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-label text-ink-glass">
          {s.setups.length > 0 && (
            <label className="flex min-w-0 items-center gap-1.5">
              {tr("Start from")}
              <select aria-label="Start from" className={`${INPUT} max-w-[12rem]`} value={s.start ?? ''} onChange={(e) => startFrom(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">{tr("The layers’ names")}</option>
                {s.setups.map((x, i) => (
                  <option key={i} value={i}>
                    {x.at ? `${x.file} · ${new Date(x.at).toLocaleDateString()}` : `The site’s file (${x.file})`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5" title="Keep the units, the coordinates and what each layer is, in this browser, for the next file">
            <input type="checkbox" className="h-4 w-4 accent-ink" checked={s.remember} onChange={(e) => setRemember(e.target.checked)} />
            {tr("Remember this setup")}
          </label>
        </div>
      )}
      <div className="flex justify-end gap-1.5">
        <button type="button" className={BUTTON} title="Leave the site as it was (Escape)" onClick={cancel}>
          {tr("Cancel")}
        </button>
        <button
          type="button"
          disabled={!ok}
          data-tour="survey-import"
          title={ok ? 'Import what was chosen, in one step (undo brings the site back)' : why}
          className="pressable h-row rounded-control bg-ink px-3 text-label font-semibold text-on-ink shadow-control hover:opacity-90 disabled:opacity-40"
          onClick={commit}
        >
          {tr("Import")}
        </button>
      </div>
    </div>
  )
}

export function SurveyWindow() {
  const s = useSiteImport((st) => (st.pending?.kind === 'survey' ? st.pending : null))
  const open = s !== null
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useSiteImport.getState().cancel()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])
  if (!s) return null
  const table = s.file.kind === 'table'
  return (
    <section
      role="dialog"
      aria-label={`Import ${s.file.name}`}
      className="glass pointer-events-auto absolute left-4 top-4 z-10 flex select-text max-h-[calc(100%-2rem)] w-[25rem] max-w-[calc(100%-2rem)] flex-col rounded-glass shadow-glass phone:inset-x-3 phone:top-3 phone:w-auto"
    >
      <header className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
        <h2 className="min-w-0 truncate text-headline">
          Import · <span className="font-semibold">{s.file.name}</span>
        </h2>
        <button
          type="button"
          aria-label="Cancel the import"
          title="Leave the site as it was (Escape)"
          className="pressable -mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-pill text-ink-glass hover:bg-hover hover:text-ink"
          onClick={() => useSiteImport.getState().cancel()}
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-1">
        <Brings s={s} />
        <Step n={1} title="Units and coordinates" tour="survey-units">
          <Coordinates s={s} />
        </Step>
        <Step n={2} title={table ? 'Columns' : 'Layers'} tour="survey-layers">
          {table ? <Columns s={s} /> : <Layers s={s} />}
        </Step>
        <Step n={3} title={table || s.brings === 'references' ? 'What it brings' : 'Boundary and ground'} tour="survey-boundary">
          {!table && s.brings === 'site' && <Boundary s={s} />}
          {s.brings === 'site' && <Ground s={s} />}
          <Kept s={s} />
        </Step>
      </div>
      <Foot s={s} />
    </section>
  )
}
