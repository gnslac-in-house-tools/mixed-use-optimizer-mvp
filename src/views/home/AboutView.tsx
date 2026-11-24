// Home's About (Decision "Home libraries"): in the table's place, what GFit is, how a project goes, the three ways to
// model, the files it reads and writes, where the work is kept, every version and what it brought (Decision "Release
// versions": the same as the repository's Releases, which the public link's users cannot open), and the repository
// with this build's version and commit. Words only, scrolled inside its panel so Home itself never scrolls.
import type { ReactNode } from 'react'
import { isSoon, usePluginModes } from '../../plugins/index.ts'

export const REPOSITORY = 'https://github.com/gnslac-in-house-tools/gfit-generative-information-modeler'

/** This build (server/versions.ts), read once: Vite writes `__GFIT_BUILD__` out wherever it is named. */
export const BUILD = __GFIT_BUILD__

/** This build's version as Home shows it ("v0.14.0"); with no release tag, a local build. */
export const versionLabel = (version = BUILD.version) => (version ? `v${version}` : 'A local build')

const STEPS: { title: string; text: string }[] = [
  { title: 'Site', text: 'Import the survey (DXF, DWG, a CSV of points, KML, GeoJSON, a Shapefile) or draw the boundary; the contours make the ground.' },
  { title: 'Massing', text: 'The brief’s programs as masses and blocks: a block is a building designed once, step by step, and placed as copies.' },
  { title: 'Flow', text: 'Roads, gates, truck courts, docks and parking follow the buildings; platforms are graded on the ground, cut and fill measured.' },
  { title: 'Options', text: 'Each option is a design of its own; the KPIs measure each against the site’s rules, side by side.' },
]

/** `plugin`: while it is held back as "coming soon" (Decision "Coming soon") its row says so. */
const WAYS: { title: string; text: string; plugin?: string }[] = [
  { title: 'By hand', text: 'Drag, stretch and rotate buildings; what depends on them follows, one undo step each.' },
  { title: 'Optimizer', text: 'Say what may change and what to aim for, stage by stage in any order; it searches options that keep every rule.', plugin: 'optimizer' },
  { title: 'Agent', text: 'Ask in words; it runs the same tools as the buttons (off in the sample).', plugin: 'agent' },
]

const FILES: { ext: string; text: string }[] = [
  { ext: '.gft', text: 'A project with all its options: File › Export › Project (.gft) saves one to share; Load project opens it.' },
  { ext: '.gfb', text: 'A block, from Blocks: uploaded by a colleague, brought into any project.' },
  { ext: '.gfs · DXF', text: 'A terrain, from Terrain: its boundary, access and ground; the DXF for CAD.' },
  { ext: '.3dm · .ifc · Speckle', text: 'The 3D model, from Export: the masses, the site and the ground.' },
  { ext: '.csv', text: 'The decision log, from Export.' },
]

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-secondary">{title}</h3>
      {children}
    </section>
  )
}

function Terms({ items }: { items: { term: string; text: string }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1.5 text-body">
      {items.map((x) => (
        <div key={x.term} className="contents">
          <dt className="font-semibold text-ink">{x.term}</dt>
          <dd className="text-ink-secondary">{x.text}</dd>
        </div>
      ))}
    </dl>
  )
}

export function AboutView() {
  const build = BUILD
  const soon = usePluginModes((m) => m.soon)
  const agentHere = !isSoon(soon, 'agent')
  return (
    <section aria-label="About" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto rounded-[0.875rem] bg-panel p-5 shadow-[inset_0_0_0_1px_var(--separator)]">
      <header className="flex flex-col gap-1.5">
        <h2 className="text-headline text-ink">About GFit</h2>
        <p className="max-w-[44rem] text-body text-ink-secondary">
          GFit, the Generative Information Modeler, is a test fit for buildings on a real site, in the browser: industrial parks first — warehouses, offices, roads, docks and
          platforms on the ground — measured as you go, growing towards geometry with information (datasets, BIM).
        </p>
      </header>
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 phone:grid-cols-1">
        <Part title="How a project goes">
          <ol className="flex flex-col gap-1.5 text-body">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[1.25rem_1fr] gap-x-2">
                <span className="text-ink-tertiary">{i + 1}</span>
                <span className="text-ink-secondary">
                  <span className="font-semibold text-ink">{s.title}.</span> {s.text}
                </span>
              </li>
            ))}
          </ol>
        </Part>
        <Part title="Three ways to model">
          <Terms items={WAYS.map((w) => ({ term: w.title, text: w.plugin && isSoon(soon, w.plugin) ? `${w.text} Coming soon.` : w.text }))} />
        </Part>
        <Part title="Files">
          <Terms items={FILES.map((f) => ({ term: f.ext, text: f.text }))} />
        </Part>
        <Part title="Where the work is kept">
          <p className="text-body text-ink-secondary">
            In this browser: projects, blocks and terrains are saved as you work and stay here, at this address, until the browser’s data is cleared; Export makes a file to keep or share.
            Nothing goes to a server unless you publish to Speckle{agentHere ? ' or ask the agent' : ''}.
          </p>
        </Part>
      </div>
      {build.versions.length > 0 && (
        <Part title="Versions">
          <ol aria-label="Versions" className="flex flex-col gap-2.5 text-body">
            {build.versions.map((v) => (
              <li key={v.version} aria-label={`v${v.version}`} className="grid grid-cols-[6rem_1fr] gap-x-3">
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums text-ink">v{v.version}</span>
                  <span className="text-caption text-ink-tertiary">{v.date}</span>
                </span>
                <ul className="flex flex-col gap-0.5 text-ink-secondary">
                  {v.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Part>
      )}
      <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-separator pt-3 text-label text-ink-secondary">
        <a href={REPOSITORY} target="_blank" rel="noreferrer" className="font-semibold text-ink underline-offset-2 hover:underline">
          Repository ↗
        </a>
        <a href={`${REPOSITORY}/releases`} target="_blank" rel="noreferrer" className="font-semibold text-ink underline-offset-2 hover:underline">
          Releases ↗
        </a>
        <span>{[build.version && `Version ${build.version}`, build.commit ? `Build ${build.commit} · ${build.date}` : 'A local build'].filter(Boolean).join(' · ')}</span>
      </footer>
    </section>
  )
}
