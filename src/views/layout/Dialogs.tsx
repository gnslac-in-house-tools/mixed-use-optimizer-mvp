// Brief, Program and Rules, windows over the app (Decisions "Brief and Rules as windows", "Program rule set layout"; the
// user: "the viewport does not change, whatever the tool: Brief and Rules open as a window, the background darkened").
// Opened from the Design menu (Brief…, Rules…; Program from the Blocks tab), from each window's foot (Edit programs → Program, Approve
// programs → Rules) and from the links that went to their steps.
// Almost the whole window, the app darkened behind it and still seen round its edges: a click there, ✕ or Escape
// closes it. The keys are the window's while it is open (the dispatcher's places, commands/dispatch.ts): undo and redo; in
// Rules, R draws a rule, Delete removes the picked one, S solves (and closes it, to see what it made: commands/rules.ts),
// Escape lets the pick go first (useShortcuts.ts).
//   Brief  the brief's page (brief/Brief.tsx): the site's figures, the programs' table, + Program, Edit programs
//   Program a program's rule set designed alone (modules/warehouse/views/ProgramWindow.tsx): a warehouse step by step, its plan or 3D
//   Rules  its tools on top (Draw rule, the new rule's kind, how the lines are drawn), the diagram of programs, and
//          the rules list under it, a divider sharing the height (Decision "Rules under the graph"); at its foot, as
//          the Brief's, *Approve rules → Plan*: the window closes, back to the viewport (Decision "Approve rules")
import { useEffect, useRef, type ReactNode } from 'react'
import type { RuleKind } from '../../model/schema.ts'
import { pluginWindowOf, PluginWindowView } from '../../plugins/index.ts'
import { Brief } from '../brief/Brief.tsx'
import { ProgramWindow } from '../../modules/warehouse/views/ProgramWindow.tsx'
import { VentanaReglas } from '../../modules/residential/views/calificacion/VentanaReglas.tsx' // mixed-use-mvp
import { VentanaUnidad } from '../../modules/residential/views/VentanaUnidad.tsx' // mixed-use-mvp (pieza 3)
import { Divider } from '../controls/Divider.tsx'
import { trapTab } from '../controls/focus.ts'
import { titleWith } from '../commands/shortcuts.ts'
import { Icon } from '../controls/Icon.tsx'
import { Diagram } from '../graph/Diagram.tsx'
import { GRAPH_SHARE, LINE_STYLES, RULE_KINDS, toggleRuleTool, useGraph, type LineStyle } from '../graph/graphState.ts'
import { Rules } from '../graph/Rules.tsx'
import { Note } from './Note.tsx'
import { useUi } from './ui.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const SELECT = 'h-7 shrink-0 rounded-control bg-fill px-1.5 text-label text-ink outline-none focus:bg-hover'

export function Dialogs() {
  const dialog = useUi((s) => s.dialog)
  if (!dialog) return null
  // a plugin's window (Decision "Stages layout"): its view in the same frame
  const plugin = pluginWindowOf(dialog)
  if (plugin)
    return (
      <Frame key={dialog} label={plugin.label}>
        <PluginWindowView windowKey={plugin.key} />
      </Frame>
    )
  // mixed-use-mvp (calificación): the residential module's rules window, in the same frame
  if (dialog === 'calificacion')
    return (
      <Frame key={dialog} label="Reglas de calificación">
        <VentanaReglas />
      </Frame>
    )
  // mixed-use-mvp (pieza 3): the department editor, in the same frame
  if (dialog === 'unidad')
    return (
      <Frame key={dialog} label="Departamento">
        <VentanaUnidad />
      </Frame>
    )
  if (dialog !== 'brief' && dialog !== 'program' && dialog !== 'rules') return null
  return (
    <Frame key={dialog} label={dialog === 'brief' ? 'Brief' : dialog === 'program' ? 'Program' : 'Rules'}>
      {dialog === 'brief' ? <Brief /> : dialog === 'program' ? <ProgramWindow /> : <RulesWindow />}
    </Frame>
  )
}

/** The window: the app darkened round it; ✕, Escape or a click outside closes it; Tab stays inside. */
function Frame({ label, children }: { label: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const close = () => useUi.getState().closeDialog()
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    root.current?.focus()
    return () => before?.focus?.()
  }, [])
  return (
    <div
      data-dialog-backdrop
      className="fixed inset-0 z-[60] bg-black/40 p-[4vh_4vw] phone:p-2"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-tour={`dialog-${label.toLowerCase()}`}
        tabIndex={-1}
        className="relative flex h-full min-h-0 w-full select-text flex-col rounded-panel shadow-sheet outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Tab') trapTab(e, root.current)
        }}
      >
        {children}
        <button
          type="button"
          aria-label={`Close the ${label}`}
          data-tour="dialog-close"
          title="Close (Esc)"
          onClick={close}
          className="pressable absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Rules: its tools, the diagram and the list under it. */
function RulesWindow() {
  const { tool, kind, lines, share, setTool, setKind, setLines, setShare } = useGraph()
  const column = useRef<HTMLDivElement>(null)
  return (
    <div className="panel flex h-full min-h-0 flex-col gap-3 p-panel-pad">
      <header className="flex flex-wrap items-center gap-3 pr-10">
        <h2 className="text-headline">{tr("Rules")}</h2>
        <div role="group" aria-label="Rules tools" className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={tool === 'rule'}
            title={titleWith('Drag from one program to another to add a rule of this kind', 'rules.rule')}
            onClick={toggleRuleTool}
            className={`pressable flex h-7 items-center gap-1.5 rounded-control px-2 text-label ${
              tool === 'rule' ? 'bg-fill font-semibold text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'
            }`}
          >
            <Icon name="link" className="h-4 w-4" />
            {tr("Draw rule")}
          </button>
          <select
            aria-label="New rule kind"
            title="New rule kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as RuleKind)
              setTool('rule')
            }}
            className={SELECT}
          >
            {RULE_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-label text-ink-secondary">
          {tr("Lines")}
          <select aria-label="Lines" title="Lines" value={lines} onChange={(e) => setLines(e.target.value as LineStyle)} className={SELECT}>
            {LINE_STYLES.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div ref={column} className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 shrink-0 overflow-hidden rounded-control bg-panel-sunken" style={{ height: `${share * 100}%` }}>
          <Diagram />
        </div>
        <Divider
          between="rows"
          label="Divider between the graph and its rules"
          title="Drag to share the height; double-click puts it back"
          container={column}
          fraction={share}
          reset={GRAPH_SHARE}
          onChange={setShare}
        />
        <div className="min-h-0 flex-1">
          <Rules />
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-separator pt-3">
        <Note>Next, the plan: ▶ Solve all, in Issues (or S), turns the brief into masses where these rules ask.</Note>
        <button
          type="button"
          title="The rules are ready: back to the plan"
          onClick={() => useUi.getState().closeDialog()}
          className="pressable flex h-7 shrink-0 items-center gap-1.5 rounded-control bg-ink px-3 text-label font-semibold text-on-ink shadow-control hover:opacity-90"
        >
          <Icon name="check" className="h-3.5 w-3.5" />
          Approve rules → Plan
        </button>
      </footer>
    </div>
  )
}
