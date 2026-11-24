/** This build (vite.config.ts `define`, server/versions.ts: Decision "Release versions"): its version ('' with no
 *  release tag yet), the commit built and its day (empty strings outside a git checkout), every version newest first. */
declare const __GFIT_BUILD__: {
  version: string
  commit: string
  date: string
  versions: { version: string; date: string; changes: string[] }[]
}
