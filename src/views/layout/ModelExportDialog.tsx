// "3D model…", Export's first row (Decision "Model export"): one dialog for the model in the format asked — Rhino
// (.3dm) or IFC — and what goes in it: Geometry (the buildings and the site's lines),
// Terrain (the ground as it is and graded, its contours) or All. Without a ground, only Geometry. The writers load only
// on Export (rhino3dm from its CDN; the IFC is written here). The choice is kept while the tab is open.
// Speckle (Decision "Speckle publish") publishes instead of downloading: its section (SpeckleSection.tsx) signs in and
// picks the project and model; the dialog stays open while it uploads and then shows the link.
import { useEffect, useId, useRef } from 'react'
import { create } from 'zustand'
import { fileName } from '../../io/gft.ts'
import { hasGround, type ModelPart } from '../../io/exportModel.ts'
import { useApp } from '../../state/store.ts'
import { trapTab } from '../controls/focus.ts'
import { Segmented } from '../controls/Segmented.tsx'
import { download } from './browserIo.ts'
import { publishToSpeckle, useSpeckle } from './speckle.ts'
import { SpeckleSection } from './SpeckleSection.tsx'
import { useToast } from './toast.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export type ModelFormat = 'rhino' | 'ifc' | 'speckle'

const FORMATS: { key: ModelFormat; label: string; detail: string }[] = [
  { key: 'rhino', label: 'Rhino (.3dm)', detail: 'A layer per building and program, each mass with its User Text; the ground as a mesh, with its contours.' },
  { key: 'ifc', label: 'IFC', detail: 'IFC 4 for any BIM tool: storeys, each mass a space with its program and a “GFit” property set; the ground as terrain.' },
  {
    key: 'speckle',
    label: 'Speckle',
    detail: 'A new version in a Speckle project: each mass with its program and properties, coloured by program; other tools take it with Speckle’s connectors.',
  },
]

const PARTS: { key: ModelPart; label: string; detail: string }[] = [
  { key: 'geometry', label: 'Geometry', detail: 'The option’s buildings and the site’s lines.' },
  { key: 'terrain', label: 'Terrain', detail: 'The ground as it is and graded under the platforms, with its contours.' },
  { key: 'all', label: 'All', detail: 'The buildings on the ground: both, in the same coordinates.' },
]

export const useModelExport = create<{ open: boolean; format: ModelFormat; part: ModelPart }>(() => ({ open: false, format: 'rhino', part: 'all' }))
export const openModelExport = () => useModelExport.setState({ open: true })
const close = () => useModelExport.setState({ open: false })

/** The model's file name: the project's, and what it holds when not all. */
export function modelFileName(name: string, format: ModelFormat, part: ModelPart): string {
  const what = `${name}${part === 'all' ? '' : ` ${part}`}`
  return fileName(what, format === 'rhino' ? '3dm' : 'ifc')
}

/** The model as asked, downloaded; what went wrong in the toast. */
export async function exportModelFile(format: Exclude<ModelFormat, 'speckle'>, part: ModelPart): Promise<void> {
  const { project, derived } = useApp.getState()
  const { show } = useToast.getState()
  const label = FORMATS.find((f) => f.key === format)!.label
  show('info', `Exporting the model for ${label}…`)
  try {
    const name = modelFileName(project.name, format, part)
    if (format === 'rhino') {
      const { export3dm } = await import('../../io/export3dm.ts')
      const bytes = await export3dm(project, derived, part)
      download(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }), name)
    } else {
      const { exportIfc } = await import('../../io/exportIfc.ts')
      download(new Blob([exportIfc(project, derived, part)], { type: 'application/x-step' }), name)
    }
    useToast.getState().close()
  } catch (e) {
    show('error', `Could not export the model for ${label}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export function ModelExportDialog() {
  const open = useModelExport((s) => s.open)
  return open ? <Dialog /> : null
}

function Dialog() {
  const { format, part } = useModelExport()
  const ground = useApp((s) => hasGround(s.project))
  const shownPart: ModelPart = ground ? part : 'geometry'
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    root.current?.focus()
    return () => before?.focus?.()
  }, [])

  const speckle = format === 'speckle'
  const signedIn = useSpeckle((s) => !!s.account && !!s.projectId)
  const status = useSpeckle((s) => s.status.kind)
  const projectName = useApp((s) => s.project.name)
  const go = () => {
    if (speckle) {
      const { project, derived } = useApp.getState()
      return void publishToSpeckle(project, derived, shownPart)
    }
    close()
    void exportModelFile(format, shownPart)
  }
  const noGround = 'This site has no ground: import its terrain in Site first'

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-gutter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="panel max-h-full w-full max-w-lg select-text overflow-y-auto p-panel-pad text-ink shadow-sheet outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Tab') return trapTab(e, root.current)
          if (e.key === 'Escape') close()
          e.stopPropagation()
        }}
      >
        <h2 id={titleId} className="text-headline">
          {tr("Export 3D model")}
        </h2>
        <p className="mt-1 text-label text-ink-secondary">{tr("The active option, in metres, where it stands on the site.")}</p>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-label text-ink-secondary">{tr("Format")}</span>
            <Segmented kind="toggle" label="Format" stretch options={FORMATS} value={format} onChange={(f) => useModelExport.setState({ format: f })} />
            <p className="text-caption text-ink-secondary">{FORMATS.find((f) => f.key === format)!.detail}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-label text-ink-secondary">{tr("Include")}</span>
            <Segmented
              kind="toggle"
              label="Include"
              stretch
              options={PARTS.map((x) => ({ ...x, disabled: !ground && x.key !== 'geometry', title: !ground && x.key !== 'geometry' ? noGround : x.detail }))}
              value={shownPart}
              onChange={(x) => useModelExport.setState({ part: x })}
            />
            <p className="text-caption text-ink-secondary">{ground ? PARTS.find((x) => x.key === shownPart)!.detail : `${PARTS[0].detail} ${noGround}.`}</p>
          </div>
          {speckle && <SpeckleSection projectName={projectName} />}
          <div className="flex justify-end gap-1">
            <button type="button" onClick={close} className="pressable rounded-control px-3 py-1.5 text-body font-medium hover:bg-hover">
              {speckle && status === 'done' ? 'Close' : 'Cancel'}
            </button>
            {!(speckle && status === 'done') && (
              <button
                type="button"
                onClick={go}
                disabled={speckle && (!signedIn || status === 'busy')}
                className="pressable rounded-control bg-fill px-3 py-1.5 text-body font-medium shadow-control hover:bg-hover disabled:opacity-50"
              >
                {speckle ? 'Publish' : 'Export'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
