// The From zero tutorial's site file (public/tutorial/site.dxf, made by scripts/tutorial-site.mjs): fetched, not
// bundled, and opened in the survey window as a file dropped on the app would be. A file picker cannot be driven by a
// script, so the tutorial offers this file itself.
import { readSiteFile } from '../../../io/site/siteFile.ts'
import { useToast } from '../../layout/toast.ts'
import { useSiteImport } from '../../plan/site/importState.ts'

export const TUTORIAL_SITE_URL = `${import.meta.env.BASE_URL}tutorial/site.dxf`

let source = async (): Promise<ArrayBuffer> => {
  const r = await fetch(TUTORIAL_SITE_URL)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.arrayBuffer()
}

/** For tests: where the file's bytes come from. */
export function setTutorialSiteSource(load: () => Promise<ArrayBuffer>): void {
  source = load
}

/** The tutorial's site file, opened in the survey window; a failure only shows in a toast. */
export async function openTutorialSite(): Promise<void> {
  try {
    useSiteImport.getState().begin(await readSiteFile('site.dxf', await source()))
  } catch (e) {
    useToast.getState().show('error', `Could not load the tutorial’s site file: ${e instanceof Error ? e.message : String(e)}`)
  }
}
