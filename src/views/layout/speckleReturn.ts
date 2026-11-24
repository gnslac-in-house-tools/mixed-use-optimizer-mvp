// Back from Speckle (Decision "Speckle sign-in"), as the page loads: Speckle sends the browser to the public link,
// with `?access_code=` after its login and without it after a workspace's SSO. The address is put back as GFit had it
// (the project's route) before the screen opens it, then the code is traded and the 3D model dialog opens on Speckle.
import { accessCodeOf } from '../../io/speckleAuth.ts'
import { useModelExport } from './ModelExportDialog.tsx'
import { finishSpeckleSignIn, loadProjects, takePending, useSpeckle } from './speckle.ts'

/** Run before the screen reads the address; null when the page did not come back from Speckle. */
export function returnFromSpeckle(): Promise<void> | null {
  const code = accessCodeOf(window.location.search)
  const pending = takePending()
  if (!code && !pending) return null
  // the code is one-time and no use in the address (nor in a bookmark, nor in Back)
  window.history.replaceState(null, '', `${window.location.pathname}${pending?.hash ?? window.location.hash}`)
  if (!pending) return null
  useModelExport.setState({ open: true, format: 'speckle' })
  if (code && pending.verifier) return finishSpeckleSignIn(code, pending.verifier)
  // after the workspace's SSO: the same account, listed again
  useSpeckle.setState({ status: { kind: 'idle' }, projects: null })
  return loadProjects()
}
