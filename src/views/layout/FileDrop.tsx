// A .gft dragged from the disk onto the app opens it (Decisions "Saving", "Save in the app"; the user: "the projects I
// save on my disk, is there no way to bring them back to the web app? dragging them, or with an open-file button").
// While a file is dragged over the window a sheet says where it goes; dropped, it opens as *Load project* does (asking
// first when the project has changes this browser has not kept); the file is read, never written again. Only files: a
// program dragged onto a mass, or a row of the Brief, is not this. A site's file (Phase 5) is imported as the Site
// step's *Import* does.
import { useEffect, useState } from 'react'
import { isSiteFile, SITE_FILE_ACCEPT } from '../../io/site/siteFile.ts'
import { importSiteFile } from '../plan/site/importState.ts'
import { openGft } from './files.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const carriesFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')

export function FileDrop() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    // dragenter and dragleave fire for every element crossed: count them
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth++
      setOver(true)
    }
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const overIt = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      // without this the browser opens the file itself, in place of the app
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      const file = e.dataTransfer?.files[0]
      if (!file) return
      // a site's file (a DXF, a KML…) goes to the Site step's Import (Decision "Site step layout")
      if (isSiteFile(file.name)) {
        void importSiteFile(file)
        return
      }
      void openGft(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', overIt)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', overIt)
      window.removeEventListener('drop', drop)
    }
  }, [])
  if (!over) return null
  return (
    <div role="status" aria-label="Open a project" className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/20 p-gutter">
      <div className="panel flex flex-col items-center gap-1 px-8 py-6 shadow-sheet">
        <p className="text-headline">{tr("Drop the .gft to open it")}</p>
        <p className="text-caption text-ink-secondary">{tr("It takes the current project’s place (asking first if that one has changes this browser has not kept).")}</p>
        <p className="text-caption text-ink-secondary">A site’s file ({SITE_FILE_ACCEPT.split(',').join(' ')}) is imported into the site: its boundary, its ground.</p>
      </div>
    </div>
  )
}
