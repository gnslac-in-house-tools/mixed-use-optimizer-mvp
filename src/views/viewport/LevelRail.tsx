// The levels rail, top right of the viewport (Decision "Levels"; port of Plaza-Practiko `vistas/paneles/LevelRail.tsx`,
// with IZA's rail as a mini-section beside it):
//   building  with 2+ buildings in the option, which one the rail shows (the user: "the levels I have do not show up
//             here… only one level appears"): picked, it goes to that building's lowest level
//   list      the levels, highest on top as in the building, *All* above them with 2+ levels; a click goes to one
//   section   the building at elevation scale, as tall as the list: each level's span (×N floors marked), the active
//             one dark, the ground at 0. A slider, as IZA's (Decision "Levels tab"), floor by floor (Decision "Floor by
//             floor": a ×6 level is six stops): pressed, it goes to the floor under the pointer; dragged, through every
//             floor it passes, the floor's name beside it; let go, its handle settles on the floor nearest to where it
//             stopped. ↑ ↓ from the keyboard
//   Ref.      the reference levels' outlines on the plan (Decision "Reference reach"): a click turns it on or off;
//             ▾ or a right-click sets how many levels below and above (none, 1, 2, 3, all), fainter the farther
//             (with 2+ levels, not in All)
// The small plans of every level, once *Levels…* under the list, went with the Levels tab (Phase AS.3).
import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { Level } from '../../model/schema.ts'
import { buildingOfLevel, optionBuildings, optionOf } from '../../engine/buildings.ts'
import { levelTop } from '../../engine/levels.ts'
import { useApp } from '../../state/store.ts'
import { Icon } from '../controls/Icon.tsx'
import { Segmented } from '../controls/Segmented.tsx'
import { useCloseOutside } from '../controls/useCloseOutside.ts'
import { ALL as ALL_REACH, REACHES, reachText, referenceLevels, useReference, type Reach } from '../plan/reference.ts'
import { beginDrag } from '../controls/beginDrag.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** The rail's All option: no level id looks like it (newId gives `l<n>`). */
const ALL = 'all levels'

const label = (l: Level) => (l.repeat > 1 ? `${l.name} ×${l.repeat}` : l.name)

export function LevelRail() {
  const project = useApp((s) => s.project)
  const active = useApp((s) => s.level)
  // the active building's levels (Decision "Buildings and options")
  const building = buildingOfLevel(project, active) ?? project.buildings[0]
  const levels = building.levels
  const showAll = useApp((s) => s.showAll)
  const setLevel = useApp((s) => s.setLevel)
  const setShowAll = useApp((s) => s.setShowAll)
  const several = levels.length >= 2
  const option = useApp((s) => s.option)
  const buildings = useMemo(() => optionBuildings(project, optionOf(project, option)), [project, option])

  const options = useMemo(() => {
    const byLevel = [...levels]
      .sort((a, b) => b.elevation - a.elevation)
      .map((l) => ({ key: l.id, label: label(l), title: `${l.name} · elevation ${l.elevation.toFixed(2)} m` }))
    if (levels.length < 2) return byLevel
    return [{ key: ALL, label: 'All', title: 'Every level: the whole building in 3D, every outline on the plan' }, ...byLevel]
  }, [levels])

  return (
    // only its controls take the pointer: the empty corner beside them is the plan's (a street drawn there)
    <div className="pointer-events-none flex flex-col items-end gap-1.5 [&>*]:pointer-events-auto">
      {buildings.length >= 2 && (
        <select
          aria-label="Building shown"
          title="The building whose levels the rail shows"
          value={building.id}
          onChange={(e) => {
            const b = buildings.find((x) => x.id === e.target.value)
            const lowest = b && [...b.levels].sort((x, y) => x.elevation - y.elevation)[0]
            if (lowest) setLevel(lowest.id)
          }}
          className="glass h-[2rem] max-w-[11rem] truncate rounded-pill px-3 text-label text-ink outline-none"
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-stretch gap-1.5">
        <Segmented
          kind="tabs"
          label="Level"
          surface="glass"
          orientation="vertical"
          options={options}
          value={showAll && several ? ALL : active}
          onChange={(k) => (k === ALL ? setShowAll(true) : setLevel(k))}
        />
        {several && <Section levels={levels} active={showAll ? null : active} onPick={setLevel} />}
      </div>
      {several && !showAll && <RefButton />}
    </div>
  )
}

/** The way an arrow says: ↓ 1, ↑ all. */
const arrows = (r: Reach) =>
  [r.below > 0 && `↓${r.below === ALL_REACH ? '∞' : r.below}`, r.above > 0 && `↑${r.above === ALL_REACH ? '∞' : r.above}`].filter(Boolean).join(' ')

/** Ref.: on or off with a click; its reach (how many levels below and above) from ▾ or a right-click. */
function RefButton() {
  const project = useApp((s) => s.project)
  const active = useApp((s) => s.level)
  const on = useReference((s) => s.on)
  const reach = useReference((s) => s.reach)
  const toggle = useReference((s) => s.toggle)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const root = useRef<HTMLDivElement>(null)
  useCloseOutside(open, close, root)
  const shown = referenceLevels(project, active, { on: true, reach }).length > 0
  const text = on ? `Ref. ${arrows(reach)}${shown ? '' : ' —'}` : 'Ref.'
  const menu = (e: MouseEvent) => {
    e.preventDefault()
    setOpen(true)
  }
  return (
    <div ref={root} className="relative flex items-center gap-0.5">
      <button
        type="button"
        aria-pressed={on}
        // the accessible name starts with what is seen (WCAG 2.5.3)
        aria-label={`${text}: ${on ? (shown ? 'other levels’ outlines' : 'no level there') : 'no reference'}`}
        title={shown ? 'Outlines of the levels below or above, to line up with them; right-click: how many' : 'No level that way: right-click to choose how many below and above'}
        className={`glass pressable grid h-[2rem] place-items-center rounded-l-pill rounded-r-control pl-3 pr-2 text-label ${on ? 'font-medium text-ink' : 'text-ink-glass'}`}
        onClick={toggle}
        onContextMenu={menu}
      >
        {text}
      </button>
      <button
        type="button"
        aria-label="Reference levels"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="How many levels below and above"
        className="glass pressable grid h-[2rem] w-[1.5rem] place-items-center rounded-l-control rounded-r-pill text-ink-glass hover:text-ink"
        onClick={() => setOpen(!open)}
        onContextMenu={menu}
      >
        <Icon name="chevronDown" className="h-3 w-3" />
      </button>
      {open && (
        <div role="dialog" aria-label="Reference levels" className="glass absolute right-0 top-full z-10 mt-1.5 flex w-max flex-col gap-2 rounded-glass p-2.5">
          {(['below', 'above'] as const).map((way) => (
            <div key={way} className="flex items-center justify-between gap-3">
              <span className="text-label text-ink-secondary">{way === 'below' ? 'Below' : 'Above'}</span>
              <Segmented
                kind="toggle"
                label={`Levels ${way}`}
                options={REACHES.map((n) => ({ key: reachText(n), label: n === 0 ? 'None' : n === ALL_REACH ? 'All' : String(n), title: n === 0 ? 'None' : `${reachText(n)} level${n === 1 ? '' : 's'} ${way}` }))}
                value={reachText(reach[way])}
                onChange={(k) => useReference.getState().setReach({ [way]: k === 'all' ? ALL_REACH : Number(k) })}
              />
            </div>
          ))}
          <p className="text-caption text-ink-secondary">{tr("The farther the level, the fainter its outline.")}</p>
        </div>
      )}
    </div>
  )
}

/** One floor of the building: a level's, the `k`-th of its ×N from the bottom (0 for a level that does not repeat). */
export interface Floor {
  level: Level
  k: number
  /** Where it starts and ends (m). */
  bottom: number
  top: number
}

/** Every floor of these levels, lowest first: a ×N level gives N (Decision "Floor by floor"). */
export function floorsOf(levels: Level[]): Floor[] {
  return [...levels]
    .sort((a, b) => a.elevation - b.elevation)
    .flatMap((level) =>
      Array.from({ length: level.repeat }, (_, k) => ({ level, k, bottom: level.elevation + k * level.height, top: level.elevation + (k + 1) * level.height })),
    )
}

/** The floor at elevation `e`: the one that holds it, or else the nearest (a gap, above the top, below). */
export function floorAt(floors: Floor[], e: number): Floor {
  const off = (f: Floor) => Math.max(f.bottom - e, e - f.top, 0)
  return floors.reduce((best, f) => (off(f) < off(best) ? f : best))
}

const floorText = (f: Floor) => (f.level.repeat > 1 ? `${f.level.name} · floor ${f.k + 1} of ${f.level.repeat}` : f.level.name)

/**
 * The building at elevation scale (IZA's rail as an indicator and a slider): one span per level, its floors marked,
 * the ground at 0, a handle on the floor it is on. Dragged, the handle follows the pointer through every floor (a ×6
 * level is six stops) and the active level follows it; let go, it settles on the floor nearest to where it stopped.
 */
function Section({ levels, active, onPick }: { levels: Level[]; active: string | null; onPick(id: string): void }) {
  const area = useRef<HTMLDivElement>(null)
  // where the handle is while dragged, from the top in %; null: on its floor
  const [drag, setDrag] = useState<number | null>(null)
  // the floor it is on, within the active level (a level picked elsewhere starts at its lowest)
  const [at, setAt] = useState<{ id: string; k: number } | null>(null)
  const bottom = Math.min(0, ...levels.map((l) => l.elevation))
  const top = Math.max(0, ...levels.map(levelTop))
  const span = Math.max(top - bottom, 1)
  /** From the top of the section, in %. */
  const y = (e: number) => ((top - e) / span) * 100
  const floors = floorsOf(levels)
  const level = levels.find((l) => l.id === active)
  const k = level ? Math.min(at?.id === active ? at.k : 0, level.repeat - 1) : 0
  const index = floors.findIndex((f) => f.level.id === active && f.k === k)
  const current = index < 0 ? null : floors[index]

  const go = (f: Floor) => {
    setAt({ id: f.level.id, k: f.k })
    if (f.level.id !== active) onPick(f.level.id)
  }
  /** Moves the handle to the pointer and goes to the floor under it (nothing where the rail is not measured). */
  const scrub = (clientY: number) => {
    const r = area.current?.getBoundingClientRect()
    if (!r || r.height === 0) return
    const f = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    setDrag(f * 100)
    go(floorAt(floors, top - f * span))
  }
  const handle = drag ?? (current ? (y(current.bottom) + y(current.top)) / 2 : null)

  return (
    <div
      data-level-section
      role="slider"
      tabIndex={0}
      aria-label="Level section"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={floors.length - 1}
      aria-valuenow={Math.max(0, index)}
      aria-valuetext={current ? floorText(current) : 'All'}
      title="Drag through the floors: it stays on the nearest one"
      className="glass relative my-[1.75rem] w-6 shrink-0 cursor-ns-resize touch-none select-none rounded-pill py-2"
      onPointerDown={(e) => {
        // the mouse's main button only
        if (e.pointerType === 'mouse' && e.button !== 0) return
        beginDrag(e)
        scrub(e.clientY)
      }}
      onPointerMove={(e) => drag !== null && scrub(e.clientY)}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0
        if (!step) return
        e.preventDefault()
        go(index < 0 ? floors[step > 0 ? 0 : floors.length - 1] : floors[Math.min(floors.length - 1, Math.max(0, index + step))])
      }}
    >
      <div ref={area} className="relative h-full min-h-16">
        {levels.map((l) => {
          const on = l.id === active
          return (
            <div
              key={l.id}
              data-section-level={l.id}
              title={`${label(l)} · ${l.elevation.toFixed(2)} – ${levelTop(l).toFixed(2)} m`}
              onClick={() => onPick(l.id)}
              className={`absolute inset-x-1.5 rounded-[2px] border-y border-panel ${on ? 'bg-ink' : 'bg-ink-tertiary hover:bg-ink-secondary'}`}
              style={{ top: `${y(levelTop(l))}%`, height: `${((levelTop(l) - l.elevation) / span) * 100}%` }}
            >
              {/* the floors of a typical level */}
              {Array.from({ length: l.repeat - 1 }, (_, k) => (
                <div key={k} className="absolute inset-x-0 h-px bg-panel" style={{ top: `${((k + 1) / l.repeat) * 100}%` }} />
              ))}
            </div>
          )
        })}
        {/* the ground */}
        <div className="pointer-events-none absolute -inset-x-1 h-px bg-ink-secondary" style={{ top: `${y(0)}%` }} />
        {/* the handle: on the pointer while dragged, then it settles on the middle of the floor nearest to it; while
            dragged, the floor it is on beside it */}
        {handle !== null && (
          <div
            data-level-handle
            className={`pointer-events-none absolute -inset-x-1.5 h-2.5 -translate-y-1/2 rounded-pill border-2 border-ink bg-panel shadow-control ${drag === null ? 'transition-[top] duration-150 ease-out' : ''}`}
            style={{ top: `${handle}%` }}
          >
            {drag !== null && current && (
              <span className="absolute right-[calc(100%+0.375rem)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-control bg-panel px-1.5 py-0.5 text-caption font-medium tabular-nums text-ink shadow-control">
                {floorText(current)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
