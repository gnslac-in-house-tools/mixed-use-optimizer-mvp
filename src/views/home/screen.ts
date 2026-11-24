// Home or a project (Decision "Home"): which one shows, kept in step with the address (io/route.ts). `#/` is Home and
// `#/p/<id>` the project in the store; a reload opens what the address names, the browser's Back goes Home and its
// Forward back to the project. The store always holds a project (the last one, or the demo): Home only covers it.
import { create } from 'zustand'
import { parseRoute, routeHash, type Route } from '../../io/route.ts'
import { useApp } from '../../state/store.ts'

interface ScreenState {
  /** Home shows (over the project, which stays in the store). Tests and the editor start without it. */
  home: boolean
  /** What Home's middle shows (Decision "Home libraries"): the projects' table, the block library (Phase BL.4), the
   *  terrain library or About; kept while a block is edited. */
  homeView: HomeView
}

export type HomeView = 'projects' | 'blocks' | 'terrains' | 'about'

export const useScreen = create<ScreenState>()(() => ({ home: false, homeView: 'projects' }))

function setAddress(r: Route): void {
  const hash = routeHash(r)
  if (window.location.hash !== hash) window.history.pushState(null, '', hash)
}

/** Home shows; the address says so. */
export function showHome(): void {
  setAddress({ kind: 'home' })
  useScreen.setState({ home: true })
}

/** The project in the store shows; the address names it. */
export function showProject(): void {
  setAddress({ kind: 'project', id: useApp.getState().project.id })
  useScreen.setState({ home: false, homeView: 'projects' })
}

/**
 * The first screen, from the address (main.tsx calls it once): the project it names when the store opened with it,
 * else Home. `open(id)` opens a project the address names that the store does not hold (Back and Forward), and says
 * whether it could. Returns the way to stop following the address.
 */
export function startScreen(open: (id: string) => boolean): () => void {
  const follow = () => {
    const r = parseRoute(window.location.hash)
    if (r.kind === 'project' && (r.id === useApp.getState().project.id || open(r.id))) useScreen.setState({ home: false })
    else {
      if (r.kind === 'project') window.history.replaceState(null, '', routeHash({ kind: 'home' }))
      useScreen.setState({ home: true })
    }
  }
  follow()
  window.addEventListener('popstate', follow)
  return () => window.removeEventListener('popstate', follow)
}
