// Where the app is, in the address (Decision "Home"): `#/` is Home, `#/p/<id>` a project. A reload opens what the
// address names, and the browser's Back goes Home. Pure: the hash in, the route out (and back).
import type { Id } from '../model/schema.ts'

export type Route = { kind: 'home' } | { kind: 'project'; id: Id }

export function parseRoute(hash: string): Route {
  const m = /^#\/p\/(.+)$/.exec(hash)
  return m ? { kind: 'project', id: decodeURIComponent(m[1]) } : { kind: 'home' }
}

export function routeHash(r: Route): string {
  return r.kind === 'home' ? '#/' : `#/p/${encodeURIComponent(r.id)}`
}

/** The project the address names, or null (Home, or no address at all: a test). */
export function projectInAddress(): Id | null {
  if (typeof window === 'undefined') return null
  const r = parseRoute(window.location.hash)
  return r.kind === 'project' ? r.id : null
}

/**
 * mixed-use-mvp: al entrar sin dirección (el link de Pages, localhost) se abre un proyecto en lugar de Home: la
 * dirección que toma (`#/p/<id>`), o null si ya trae una (`#/` es Home a propósito).
 */
export function direccionInicial(hash: string, id: Id): string | null {
  return hash === '' || hash === '#' ? routeHash({ kind: 'project', id }) : null
}
