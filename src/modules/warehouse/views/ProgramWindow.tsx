// The Program window (Decision "Program rule set layout"; was the Warehouse workspace, Decision "Warehouse layout"): a
// program's rule set designed alone, a window over the app between the Brief and the Rules. On top, the program picked
// (the brief's programs, its kind beside it), a Warehouse program's tools, the Help switch and Plan · 3D · Split. The
// header reads *Block editor* for a Warehouse program, from Home or inside a project (Phase BE.7). A Warehouse program with
// its type: its steps on the left, the type alone in the middle, its figures on the right; one without: its general
// level and *Start its rule set*. Under the type, the block editor's bottom bar (BlockDraftingBar.tsx, Phase BE.10). An Office or a Free program: its general level (the Brief's figures of it, its rule
// set's row) on the left, the deep editor to come. At its foot, *Save to library* (a type: Phase BL.3) and *Approve
// programs* (it only closes the window: Rules opens from Brief › Rules); opened from Home on a library block, it is the block editor (Phase BL.4): Save to library and
// Close, back to Home.
import { useMemo } from 'react'
import { briefRows } from '../../../engine/brief.ts'
import { definitionOf, kindOf } from '../../../engine/programs.ts'
import { useApp } from '../../../state/store.ts'
import { BRIEF_COLUMNS } from '../../../views/brief/columns.tsx'
import { ProgramRules } from '../../../views/brief/ProgramRules.tsx'
import { Button } from '../../../views/controls/fields.tsx'
import { titleWith } from '../../../views/commands/shortcuts.ts'
import { Icon } from '../../../views/controls/Icon.tsx'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { Group, Separator, ToolButton } from '../../../views/tools/ToolButtons.tsx'
import { Note } from '../../../views/layout/Note.tsx'
import { useModule } from '../../../views/modules.ts'
import { shown, toggleHelp, useUi, VIEWS, type View } from '../../../views/layout/ui.ts'
import { KIND_LABELS } from '../../../views/panels/programCommands.ts'
import { startType } from './commands.ts'
import { SaveBlock } from './SaveBlock.tsx'
import { blockSaved, closeBlockEditor, useBlockEditor } from '../../../views/home/blockEditor.ts'
import { hallRuns } from '../engine/generate.ts'
import { BlockDraftingBar } from './BlockDraftingBar.tsx'
import { StepsPanel } from './StepsPanel.tsx'
import { WarehouseFigures } from './WarehouseFigures.tsx'
import { WarehouseTools } from './WarehouseTools.tsx'
import { WarehouseViewport } from './WarehouseViewport.tsx'
import { useCurrentProgram, useCurrentType, useWarehouse } from './warehouseState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

/** The Brief's figures a program's general level shows, in this order. */
const GENERAL = ['kind', 'target-area', 'target-count', 'size']

export function ProgramWindow() {
  const programs = useApp((s) => s.project.programs)
  const g = useCurrentProgram()
  const t = useCurrentType()
  // the bar's Grid title: the type's module, from its runs alone
  const module = useMemo(() => {
    if (!t) return null
    const r = hallRuns(t)
    return { x: r.x.module, y: r.y.module }
  }, [t])
  const typed = useApp((s) => (g ? definitionOf(s.project, g.id) !== undefined : false))
  const warehouse = g !== null && kindOf(g) === 'warehouse'
  const deep = warehouse && typed && t !== null
  const view = useUi((s) => s.view)
  const help = useUi((s) => s.help)
  const pickProgram = useWarehouse((s) => s.pickProgram)
  const { offered, on: figures } = useModule('warehouse')
  // opened from Home on a block of the library (Phase BL.4): the block editor, Save and Close at its foot
  const editor = useBlockEditor((s) => s.open)

  return (
    <section aria-label="Program" className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-separator px-panel-pad py-2 pr-12">
        <h2 className="text-headline">{editor || warehouse ? 'Block editor' : 'Program'}</h2>
        {g ? (
          <span className="flex items-center gap-2">
            <span className="text-label text-ink-secondary">{tr("Program")}</span>
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-pill border border-separator" style={{ background: g.color }} />
            <select
              aria-label="Program to edit"
              value={g.id}
              onChange={(e) => pickProgram(e.target.value)}
              className="h-row min-w-0 rounded-control border border-separator bg-panel-sunken px-2 text-body font-semibold text-ink outline-none focus:border-ink"
            >
              {programs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            {!warehouse && <span className="text-caption text-ink-secondary">{KIND_LABELS[kindOf(g)]}</span>}
          </span>
        ) : (
          <span className="text-body text-ink-secondary">{tr("No program yet: add one in the Brief.")}</span>
        )}
        {warehouse && <WarehouseTools />}
        {/* the app's Help switch (Help › Help, F1 and ?), beside the tools: the long texts show only with it on */}
        <span className="flex shrink-0 items-stretch">
          {warehouse && <Separator />}
          <Group caption="Help">
            <ToolButton
              icon="help"
              label="Help"
              title={titleWith(help ? 'Hide the notes' : 'Show the notes that say how to use each part', 'help.help')}
              pressed={help}
              onClick={toggleHelp}
            />
          </Group>
        </span>
        {deep && (
          <span className="ml-auto">
            <Segmented
              kind="tabs"
              label="Program view"
              options={shown(VIEWS).map((v) => ({ key: v.key, label: v.label, title: v.title }))}
              value={view}
              onChange={(v: View) => useUi.getState().setView(v)}
            />
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div role="region" aria-label={deep ? 'Warehouse type' : 'General level'} className="w-[calc(var(--side-panel-w)+var(--side-rail-w))] shrink-0 overflow-y-auto overscroll-contain border-r border-separator px-panel-pad pb-panel-pad pt-3">
          {deep ? <StepsPanel /> : g && <GeneralLevel id={g.id} />}
        </div>
        <section aria-label="Viewport" className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-panel-sunken">
          {deep ? (
            <>
              <div className="relative min-h-0 flex-1">
                <WarehouseViewport />
              </div>
              <BlockDraftingBar module={module} />
            </>
          ) : (
            <div className="grid h-full place-items-center p-6">
              {g && warehouse ? (
                <div className="flex max-w-sm flex-col items-center gap-3 text-center text-body text-ink-secondary">
                  {g.name} has its general level only: its grid, size and range, as in the Brief. Its rule set, deep, is a warehouse type designed a step at a
                  time: grid, hall, columns, envelope, morphology, elements.
                  {offered ? <Button onClick={() => startType(g.id)}>{tr("Start its rule set")}</Button> : <span className="text-ink-tertiary">{tr("This typology does not offer warehouse types.")}</span>}
                </div>
              ) : (
                g && (
                  <p className="max-w-sm text-center text-body text-ink-secondary">
                    {kindOf(g) === 'office' ? 'An office' : 'A free'} program’s rule set is its general level, on the left: its kind, target, size, grid and range. Its
                    deep editor comes later.
                  </p>
                )
              )}
            </div>
          )}
        </section>
        {deep && figures && (
          <div role="region" aria-label="Warehouse figures" className="flex w-[calc(var(--side-panel-w)+var(--side-rail-w))] shrink-0 flex-col gap-6 overflow-y-auto overscroll-contain border-l border-separator px-panel-pad pb-panel-pad pt-3">
            <WarehouseFigures />
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-separator px-panel-pad py-3">
        {/* the block to the library (Phase BL.3): overwrite or a copy */}
        {deep && t && (
          <span className="mr-auto">
            <SaveBlock type={t} onSaved={blockSaved} unlink={!editor} />
          </span>
        )}
        {editor ? (
          <button
            type="button"
            title={tr("Back to Home (it asks first when the block has changes not saved)")}
            onClick={closeBlockEditor}
            className="pressable flex h-7 shrink-0 items-center gap-1.5 rounded-control bg-ink px-3 text-label font-semibold text-on-ink shadow-control hover:opacity-90"
          >
            {tr("Close")}
          </button>
        ) : (
          <>
            <Note>Next, Rules: say how the programs relate; then ▶ Solve all, in Issues, turns the brief into masses.</Note>
            <button
              type="button"
              title={tr("The programs are ready: close this window")}
              onClick={() => useUi.getState().closeDialog()}
              className="pressable flex h-7 shrink-0 items-center gap-1.5 rounded-control bg-ink px-3 text-label font-semibold text-on-ink shadow-control hover:opacity-90"
            >
              <Icon name="check" className="h-3.5 w-3.5" />
              {tr("Approve programs")}
            </button>
          </>
        )}
      </footer>
    </section>
  )
}

/** A program's general level: the Brief's figures of it (its kind, target, masses and size) and its rule set's row. */
function GeneralLevel({ id }: { id: string }) {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const k = project.programs.findIndex((g) => g.id === id)
  if (k < 0) return null
  const g = project.programs[k]
  const row = briefRows(project, derived)[k]
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-1.5">
        {GENERAL.map((key) => {
          const c = BRIEF_COLUMNS.find((x) => x.key === key)!
          return (
            <div key={key} className="flex items-center justify-between gap-3" title={c.help}>
              <dt className="shrink-0 text-label text-ink-secondary">
                {c.title} {c.unit && <span className="text-caption text-ink-tertiary">{c.unit}</span>}
              </dt>
              <dd className="min-w-0 max-w-[60%] flex-1 text-right">{c.cell(g, row)}</dd>
            </div>
          )
        })}
      </dl>
      <ProgramRules program={g} row={row} />
    </div>
  )
}
