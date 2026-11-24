// The option switch, right of the project name (Decision "Buildings layout"): `Option 1 ▾`. The active option decides
// the KPIs, the Summary and what the plan and the 3D show, so it sits with the whole project, not in a panel. Its
// menu: the options (the active one marked), then New option, Duplicate (linked), Rename, Delete and Compare (B.5:
// every option side by side, in the viewport's place). The options grouped under one (a stage plan's, Decision "Stage
// options") follow it, folded unless the active option is among them.
// Rename turns the menu into a field: Enter keeps the name, Escape leaves it. Design › Options › Rename… opens it so.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { optionGroups } from '../../engine/buildings.ts'
import type { DesignOption } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { Icon } from '../controls/Icon.tsx'
import { useCloseOutside } from '../controls/useCloseOutside.ts'
import { compareOptions, duplicateActiveOption, goToOption, newOption, removeOption, renameOption } from '../panels/buildingCommands.ts'
import { useOptionRename } from './optionRename.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const itemClass = 'pressable flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-body hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent'

export function OptionSwitch() {
  const project = useApp((s) => s.project)
  const options = project.options
  const active = useApp((s) => s.option)
  const current = options.find((o) => o.id === active) ?? options[0]
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setRenaming(false)
  }, [])
  useCloseOutside(open, close, root)
  // Design › Options › Rename… asks for the name field (optionRename.ts)
  const asked = useOptionRename((s) => s.asked)
  const seen = useRef(asked)
  useEffect(() => {
    if (asked === seen.current) return
    seen.current = asked
    setOpen(true)
    setRenaming(true)
  }, [asked])

  const run = (f: () => void) => () => {
    close()
    f()
  }
  // a group folded or unfolded by hand, this session (`<option>/<group>`)
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const item = (o: DesignOption, inGroup = false) => (
    <button
      key={o.id}
      type="button"
      role="menuitemradio"
      aria-checked={o.id === current.id}
      className={`${itemClass} ${inGroup ? 'pl-10' : ''}`}
      onClick={run(() => goToOption(o.id))}
    >
      <span aria-hidden className="grid h-[1.125rem] w-[1.125rem] shrink-0 place-items-center">
        {o.id === current.id && <Icon name="check" className="h-4 w-4" />}
      </span>
      <span className="flex-1">{o.name}</span>
      <span className="text-label text-ink-secondary">
        {o.buildingIds.length} {o.buildingIds.length === 1 ? 'building' : 'buildings'}
      </span>
    </button>
  )

  return (
    <div ref={root} data-tour="options" className="relative min-w-0 shrink">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Design option: ${current.name}`}
        title="Design options: the KPIs, the Summary and the views show the active one"
        onClick={() => (open ? close() : setOpen(true))}
        className="pressable flex max-w-full items-center gap-1 rounded-control px-1.5 py-0.5 text-body text-ink hover:bg-hover"
      >
        <span className="min-w-0 max-w-[10rem] truncate">{current.name}</span>
        <Icon name="chevronDown" className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
      </button>
      {open && (
        <div role="menu" aria-label="Design options" className="panel absolute left-0 top-full z-40 mt-1 w-max min-w-[15rem] p-1.5 shadow-sheet">
          {renaming ? (
            <RenameField
              name={current.name}
              onDone={(name) => {
                if (name !== null) renameOption(current.id, name)
                close()
              }}
            />
          ) : (
            <>
              {optionGroups(project).map(({ option: top, groups }) => (
                <Fragment key={top.id}>
                  {item(top)}
                  {groups.map((g) => {
                    const key = `${top.id}/${g.name}`
                    // folded unless the active option is in it
                    const unfolded = folds[key] ?? g.options.some((o) => o.id === current.id)
                    return (
                      <Fragment key={key}>
                        <button
                          type="button"
                          role="menuitem"
                          aria-expanded={unfolded}
                          className={`${itemClass} pl-8 text-ink-secondary`}
                          title={`${g.name}: the options made from ${top.name}`}
                          onClick={() => setFolds((f) => ({ ...f, [key]: !unfolded }))}
                        >
                          <Icon name={unfolded ? 'chevronDown' : 'chevronRight'} className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1">
                            {g.name} ({top.name})
                          </span>
                          <span className="text-label">{g.options.length}</span>
                        </button>
                        {unfolded && g.options.map((o) => item(o, true))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
              <div role="separator" className="my-1 border-t border-separator" />
              <button type="button" role="menuitem" className={itemClass} onClick={run(newOption)}>
                <Icon name="plus" className="h-[1.125rem] w-[1.125rem] shrink-0 text-ink-secondary" />
                <span className="flex-1">{tr("New option")}</span>
              </button>
              <button type="button" role="menuitem" className={itemClass} onClick={run(duplicateActiveOption)} title="The same buildings, linked: an edit shows in both">
                <Icon name="link" className="h-[1.125rem] w-[1.125rem] shrink-0 text-ink-secondary" />
                <span className="flex-1">{tr("Duplicate (linked)")}</span>
              </button>
              <button type="button" role="menuitem" className={itemClass} onClick={() => setRenaming(true)}>
                <span aria-hidden className="h-[1.125rem] w-[1.125rem] shrink-0" />
                <span className="flex-1">{tr("Rename…")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                disabled={options.length <= 1}
                title={options.length <= 1 ? 'The only option' : 'Its buildings stay in the project'}
                onClick={run(() => removeOption(current.id))}
              >
                <Icon name="trash" className="h-[1.125rem] w-[1.125rem] shrink-0 text-ink-secondary" />
                <span className="flex-1">Delete {current.name}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                disabled={options.length < 2}
                title={options.length < 2 ? 'Make a second option to compare' : 'Every option side by side, with their KPIs'}
                onClick={run(compareOptions)}
              >
                <Icon name="columns" className="h-[1.125rem] w-[1.125rem] shrink-0 text-ink-secondary" />
                <span className="flex-1">{tr("Compare…")}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** The option's name in a field: Enter keeps it (null: nothing changed), Escape leaves it. */
function RenameField({ name, onDone }: { name: string; onDone(name: string | null): void }) {
  const [draft, setDraft] = useState(name)
  return (
    <input
      aria-label="Option name"
      autoFocus
      className="h-row w-full select-text rounded-control border border-separator bg-panel-sunken px-2 text-body text-ink outline-none focus:border-ink"
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(draft.trim() && draft.trim() !== name ? draft : null)
      }}
    />
  )
}
