// Home (Decision "Home", the user's mockup F of 2026-10-28, docs/mockups/home/f-workspace.html): what the app shows
// first, filling the window and never scrolling. A sidebar of Home's own (it never folds; Decision "Home libraries"):
// Create new on top (CreateNew.tsx), Projects, Blocks, Terrain, then apart the tour and About, each but the tour
// shown in the middle (`homeView`). In the middle a small welcome with the ☾ and full screen on its right (as the top
// bar has them), the projects in a table that takes the height left (ProjectsTable), and the bottom strip:
// the three ways to model and the sample with its tour (HowItWorks). A row picks a project: its summary opens on the
// right (ProjectSummary; data on the right, controls on the left, as in the editor). The sidebar's *Blocks* shows the
// block library in the table's place (BlockLibraryView, Phase BL.4), *Terrain* the terrain library
// (TerrainLibraryView), *About* what GFit is (AboutView), and *Projects* brings the table back. At the sidebar's foot,
// this build's version (Decision "Release versions"), which opens About and its list of versions.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AboutView, BUILD, versionLabel } from './AboutView.tsx'
import { BlockLibraryView } from './BlockLibraryView.tsx'
import { CreateNewDialog, openCreateNew } from './CreateNew.tsx'
import { IconButton } from '../controls/BarButtons.tsx'
import { titleWith } from '../commands/shortcuts.ts'
import { Icon } from '../controls/Icon.tsx'
import { openFile, openGft } from '../layout/files.ts'
import { fullScreenAvailable, toggleFullScreen, useFullScreen } from '../layout/fullScreen.ts'
import { useThemeToggle } from '../layout/themeToggle.ts'
import { HowItWorks } from './HowItWorks.tsx'
import { HOME_ICONS } from './icons.ts'
import { ProjectSummary } from './ProjectSummary.tsx'
import { ProjectsTable } from './ProjectsTable.tsx'
import { freshSample, homeRows } from './rows.ts'
import { useScreen, type HomeView } from './screen.ts'
import { TerrainLibraryView } from './TerrainLibraryView.tsx'
import { startZero } from '../tour/zero/run.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** A sidebar item; `detail`: a line under its name (its accessible name stays the name). */
function NavItem({ icon, onClick, pressed, detail, tour, children }: { icon: string; onClick: () => void; pressed?: boolean; detail?: string; tour?: string; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={detail ? children : undefined}
      data-tour={tour}
      className={`pressable flex gap-3 rounded-control px-2.5 py-2 text-left text-body font-medium hover:bg-hover hover:text-ink ${detail ? 'items-start' : 'items-center'} ${pressed ? 'bg-fill text-ink' : 'text-ink-segment'}`}
    >
      <Icon path={icon} className={`h-[1.125rem] w-[1.125rem] shrink-0 ${detail ? 'mt-0.5' : ''}`} />
      {detail ? (
        <span className="flex min-w-0 flex-col gap-0.5">
          {children}
          <span className="text-caption font-normal text-ink-tertiary">{detail}</span>
        </span>
      ) : (
        children
      )}
    </button>
  )
}

export function Home() {
  const [rows, setRows] = useState(homeRows)
  const [picked, setPicked] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const view = useScreen((s) => s.homeView)
  const show = (v: HomeView) => {
    setPicked(null)
    useScreen.setState({ homeView: v })
  }
  const fileInput = useRef<HTMLInputElement>(null)
  const theme = useThemeToggle()
  const full = useFullScreen()
  const row = rows.find((r) => r.id === picked) ?? null
  const changed = () => setRows(homeRows())
  const pick = (id: string) => setPicked((p) => (p === id ? null : id))

  useEffect(() => {
    if (!row) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPicked(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [row])

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) void openGft(f)
  }

  return (
    <div
      data-home
      className={`h-app grid overflow-hidden bg-canvas font-sans text-ink transition-[grid-template-columns] duration-sheet ease-sheet phone:grid-cols-1 ${
        row ? 'grid-cols-[15.5rem_minmax(0,1fr)_24rem]' : 'grid-cols-[15.5rem_minmax(0,1fr)_0rem]'
      }`}
    >
      <aside aria-label="Home" className="flex min-h-0 flex-col gap-4 border-r border-separator bg-panel-sunken px-3.5 py-5 phone:hidden">
        <div className="flex items-center gap-2.5 px-1 text-headline font-bold">
          <span aria-hidden className="grid h-[2rem] w-[2rem] place-items-center rounded-[0.625rem] bg-ink text-on-ink">
            <Icon path={HOME_ICONS.mark} className="h-[1.125rem] w-[1.125rem]" />
          </span>
          {tr("GFit")}
        </div>
        <button
          type="button"
          onClick={() => openCreateNew()}
          data-tour="create-new"
          title="A new project or a new block"
          className="pressable flex h-[2.375rem] items-center gap-2.5 rounded-[0.625rem] bg-ink px-3 text-body font-semibold text-on-ink hover:opacity-90"
        >
          <Icon path={HOME_ICONS.create} className="h-[1.125rem] w-[1.125rem]" />
          {tr("Create new")}
        </button>
        <nav aria-label="Home" className="flex flex-col gap-0.5">
          <NavItem icon={HOME_ICONS.list} pressed={view === 'projects'} onClick={() => show('projects')}>
            {tr("Projects")}
          </NavItem>
          <NavItem icon={HOME_ICONS.library} pressed={view === 'blocks'} onClick={() => show('blocks')}>
            {tr("Blocks")}
          </NavItem>
          <NavItem icon={HOME_ICONS.terrain} pressed={view === 'terrains'} onClick={() => show('terrains')}>
            {tr("Terrain")}
          </NavItem>
          <span aria-hidden className="mx-2.5 my-2 h-px bg-separator" />
          {/* From zero (Decision "From zero tutorial"): in place of the sample's guided tour, which stays on the sample's card and the top bar's Tour */}
          <NavItem icon={HOME_ICONS.tour} tour="home-zero" detail="Build a project of your own, from a site drawing to a CAD plan." onClick={() => void startZero()}>
            {tr("Learn GFit from zero")}
          </NavItem>
          <NavItem icon={HOME_ICONS.about} pressed={view === 'about'} onClick={() => show('about')}>
            {tr("About")}
          </NavItem>
        </nav>
        <input ref={fileInput} type="file" accept=".gft,.json,application/json" aria-label="Open .gft" className="hidden" onChange={onFile} />
        <div className="mt-auto flex flex-col items-start gap-1.5 px-1.5">
          <p className="text-caption text-ink-tertiary">Projects are kept in this browser. File › Export › Project (.gft) takes one to another computer; Load project brings it in.</p>
          {/* this build's version (Decision "Release versions"): About lists it with the ones before */}
          <button
            type="button"
            aria-label={BUILD.version ? `Version ${BUILD.version}` : 'A local build'}
            title="This version and the ones before it, in About"
            onClick={() => show('about')}
            className="pressable -mx-1.5 rounded-control px-1.5 text-caption tabular-nums text-ink-tertiary hover:bg-hover hover:text-ink"
          >
            {versionLabel()}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-col gap-4 overflow-hidden px-6 pb-5 pt-4 phone:overflow-y-auto phone:px-gutter">
        <div className="-mr-2 flex shrink-0 items-center justify-between gap-3">
          <h1 className="text-headline text-ink">{tr("Welcome to GFit")}</h1>
          <div className="flex items-center gap-1">
            <IconButton icon={theme.dark ? 'sun' : 'moon'} label="Dark mode" title={theme.title} pressed={theme.dark} onClick={theme.toggle} />
            {fullScreenAvailable() && (
              <>
                <span aria-hidden className="mx-1 h-4 w-px bg-separator" />
                <IconButton
                  icon={full ? 'collapse' : 'expand'}
                  label="Full screen"
                  title={titleWith(full ? 'Exit full screen' : 'Full screen: hides the browser’s interface', 'view.fullscreen')}
                  pressed={full}
                  onClick={toggleFullScreen}
                />
              </>
            )}
          </div>
        </div>
        {view === 'blocks' ? (
          <BlockLibraryView onBack={() => show('projects')} />
        ) : view === 'terrains' ? (
          <TerrainLibraryView onBack={() => show('projects')} />
        ) : view === 'about' ? (
          <AboutView />
        ) : (
          <ProjectsTable
            rows={rows}
            picked={picked}
            narrow={!!row}
            pick={pick}
            query={query}
            setQuery={setQuery}
            onNew={() => openCreateNew('project')}
            onOpen={() => void openFile(() => fileInput.current?.click())}
          />
        )}
        <HowItWorks sample={rows[0]} blocks={freshSample().blocks} narrow={!!row} />
      </main>

      <aside
        aria-label="Summary"
        className={`min-w-0 overflow-hidden bg-panel ${row ? 'shadow-[inset_1px_0_0_var(--separator)]' : ''} phone:fixed phone:inset-0 phone:z-20 ${row ? '' : 'phone:hidden'}`}
      >
        {row && <ProjectSummary key={row.id} row={row} close={() => setPicked(null)} changed={changed} />}
      </aside>
      <CreateNewDialog />
    </div>
  )
}
