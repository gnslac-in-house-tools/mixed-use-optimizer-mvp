// The top bar (Decision "Layout"; Project C, AS.1, spec "The frame"; port of Plaza-Practiko `vistas/paneles/TopBar.tsx`):
//   the GFit logo (Home's mark; Home; the Portfolio will open from it, Phase 9.2: not shown until it works) · the menu bar (MenuBar.tsx: File ·
//   Edit · View · Site · Design · Tools · Help, the one place the app's commands are listed) · Undo and Redo, the one
//   exception to "no loose buttons" (as a CAD's quick access bar; they read the commands `edit.undo` / `edit.redo`: label,
//   key, and why not as the title when disabled) · then at the right the project's name (opens its data), what this
//   browser has of it (SaveStatus: Saved <time>, Unsaved changes…; its click is autosave) and the option switch (Decision
//   "Buildings layout"). Nothing else: the ⋯, View, Export, the theme, Help, Tour, full screen, the panels' toggles and
//   Compare are menu commands now. Short of room the right side gives way, never the menus: the project's name truncates, the
//   option switch's name truncates, and below 880 px (`panel:`, down to the phone's 768) the save status is its icon alone.
// The panel's tabs and the plugins' actions are the left panel's row of tabs (layout/PanelTabs.tsx, Decision "Panel tabs").
// What later phases build is not shown until it works: Versions…, New from a parcel…, Sign in, the Portfolio (Decision
// "Only what works is shown").
// On a phone the bar keeps the name and, beside it, the menu as one ☰ that opens the same tree as a sheet; under them, the
// view switch (Plan · 3D).
import { useEffect, type ChangeEvent } from 'react'
import { useApp } from '../../state/store.ts'
import { commandOf, runCommand } from '../commands/index.ts'
import { ShortcutsWindow } from '../commands/ShortcutsWindow.tsx'
import { titleWith } from '../commands/shortcuts.ts'
import { IconButton } from '../controls/BarButtons.tsx'
import { Icon } from '../controls/Icon.tsx'
import { HOME_ICONS } from '../home/icons.ts'
import { goHome, openGft } from './files.ts'
import { MenuBar } from './MenuBar.tsx'
import { ModelExportDialog } from './ModelExportDialog.tsx'
import { OptionSwitch } from './OptionSwitch.tsx'
import { usePhone } from './media.ts'
import { closeProjectData, openProjectData, ProjectDialog, useProjectData } from './ProjectDialog.tsx'
import { SaveStatus } from './SaveStatus.tsx'
import { ViewSwitch } from './ViewSwitch.tsx'

/** Undo or Redo as the bar's arrow: its command's label and key, and the reason as the title while it cannot run. */
function HistoryButton({ id, icon }: { id: 'edit.undo' | 'edit.redo'; icon: 'undo' | 'redo' }) {
  // the command's `enabled` reads the history: the bar renders again when it changes
  useApp((s) => s.history)
  const c = commandOf(id)
  if (!c) return null
  const label = typeof c.label === 'function' ? c.label() : c.label
  const why = c.enabled?.() ?? true
  return <IconButton icon={icon} label={label} title={why === true ? titleWith(label, id) : why} disabled={why !== true} onClick={() => runCommand(id)} />
}

export function TopBar() {
  const name = useApp((s) => s.project.name)
  const typology = useApp((s) => s.project.typology)
  const phone = usePhone()

  const dataOpen = useProjectData((st) => st.open)
  // the window goes with the bar (Home covers it): it is not left open for the next time the bar shows
  useEffect(() => closeProjectData, [])

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    // cleared, so picking the same file again fires the change again
    e.target.value = ''
    if (f) void openGft(f)
  }

  // the picker Load project… clicks, the Project data, 3D model and Keyboard shortcuts windows: what the menu's commands open
  const extras = (
    <>
      <input type="file" accept=".gft,.json,application/json" aria-label="Open .gft" className="hidden" onChange={onFile} />
      {dataOpen && <ProjectDialog onClose={closeProjectData} />}
      <ModelExportDialog />
      <ShortcutsWindow />
    </>
  )

  // Home: every project in this browser, the sample and its tour (Decision "Home")
  const home = (
    <button
      type="button"
      data-tour="home"
      aria-label="GFit"
      title="Home: your projects, the sample and its tour"
      onClick={goHome}
      className="pressable shrink-0 rounded-control p-0.5 hover:bg-hover"
    >
      <span aria-hidden className="grid h-[1.75rem] w-[1.75rem] place-items-center rounded-[0.5rem] bg-ink text-on-ink">
        <Icon path={HOME_ICONS.mark} className="h-[1rem] w-[1rem]" />
      </span>
    </button>
  )

  // the project: its name (no overflow on the h1: the button's focus ring is drawn outside and is not clipped), what the
  // browser has of it, and the option in view
  const project = (
    <div className="flex min-w-0 items-center gap-3 phone:gap-2">
      <h1 className="flex min-w-0 text-body text-ink-secondary">
        <button
          type="button"
          title={`Project data: name and typology (${typology})`}
          aria-haspopup="dialog"
          onClick={openProjectData}
          className="pressable min-w-0 max-w-full truncate rounded-control px-1 hover:bg-hover hover:text-ink"
        >
          {name}
        </button>
      </h1>
      <SaveStatus />
      <span aria-hidden className="shrink-0 text-ink-tertiary">
        /
      </span>
      <OptionSwitch />
    </div>
  )

  if (phone) {
    return (
      <header aria-label="Top bar" className="flex flex-col gap-1.5 px-gutter py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {home}
            <span aria-hidden className="h-4 w-px shrink-0 bg-separator" />
            {project}
          </div>
          <MenuBar />
        </div>
        <ViewSwitch />
        {extras}
      </header>
    )
  }

  return (
    <header aria-label="Top bar" className="flex items-center gap-3 px-gutter py-2">
      {home}
      <MenuBar />
      <span aria-hidden className="h-4 w-px shrink-0 bg-separator" />
      <div className="flex shrink-0 items-center gap-1">
        <HistoryButton id="edit.undo" icon="undo" />
        <HistoryButton id="edit.redo" icon="redo" />
      </div>
      <div className="ml-auto flex min-w-0 shrink items-center justify-end">{project}</div>
      {extras}
    </header>
  )
}
