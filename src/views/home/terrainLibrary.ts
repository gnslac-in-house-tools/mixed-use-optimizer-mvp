// The terrain library (Decision "Home libraries"), the block library's twin: two shelves put together. **GFit's** ship
// with the app, so the public link gives them to the whole team: the sample's site and Quezaltepeque's (the starter
// project's), read-only, at version 1, and the terrain files published in the repository (`src/state/terrains/*.gfs`:
// one of an id already there, at a higher version, takes its place). They are read once, when first asked (the
// surveys are large): `loadGfitTerrains`. **This browser's** (io/terrains.ts) are the terrains saved here; one saved
// over a GFit terrain (its id) shadows it in this browser. The views follow `useTerrainLibrary`.
import { create } from 'zustand'
import { readGft } from '../../io/gft.ts'
import { browserTerrains, readTerrainFile, terrainOf } from '../../io/terrains.ts'
import type { Id, LibraryTerrain, Site } from '../../model/schema.ts'
import { sampleProject } from '../../state/sample.ts'
import { STARTERS } from './starters.ts'

export type TerrainShelf = 'gfit' | 'browser'

export interface LibraryTerrainEntry {
  terrain: LibraryTerrain
  shelf: TerrainShelf
}

/** GFit's own terrains: each one's site, read when first asked. */
const GFIT_SITES: { id: Id; name: string; site: () => Promise<Site | null> }[] = [
  { id: 'gfit-industrial-park', name: 'Industrial park', site: async () => sampleProject().site },
  {
    id: 'gfit-quezaltepeque',
    name: 'Quezaltepeque, El Salvador',
    site: async () => {
      const r = readGft((await STARTERS['industrial-quezaltepeque-demo']()).default)
      return r.ok ? r.project.site : null
    },
  },
]

/** The terrain files published in the repository: GFit's too, read when first asked. */
const PUBLISHED = import.meta.glob<string>('/src/state/terrains/*.gfs', { query: '?raw', import: 'default' })

interface TerrainLibraryState {
  /** Bumped by each save and removal: the views read the shelves again. */
  count: number
  /** GFit's terrains; null until read. */
  gfit: LibraryTerrain[] | null
}

export const useTerrainLibrary = create<TerrainLibraryState>()(() => ({ count: 0, gfit: null }))

let loading: Promise<void> | null = null

/**
 * Reads GFit's terrains once (the highest version of each id); later calls wait for the same read. Each is read on its
 * own: one that cannot be (a starter's chunk gone after a deploy) is left out, the others show, and the next call
 * reads them all again.
 */
export function loadGfitTerrains(): Promise<void> {
  loading ??= (async () => {
    let missed = false
    const read = async (f: () => Promise<LibraryTerrain[]>): Promise<LibraryTerrain[]> => {
      try {
        return await f()
      } catch {
        missed = true
        return []
      }
    }
    const own = await Promise.all(
      GFIT_SITES.map((g) =>
        read(async () => {
          const site = await g.site()
          return site ? [terrainOf(site, { id: g.id, name: g.name, savedAt: 0 })] : []
        }),
      ),
    )
    const published = await Promise.all(
      Object.values(PUBLISHED).map((load) =>
        read(async () => {
          const r = readTerrainFile(await load())
          return r.ok ? [r.terrain] : []
        }),
      ),
    )
    const byId = new Map<Id, LibraryTerrain>()
    for (const t of [...own.flat(), ...published.flat()]) if ((byId.get(t.id)?.version ?? 0) < t.version) byId.set(t.id, t)
    useTerrainLibrary.setState({ gfit: [...byId.values()] })
    if (missed) loading = null
  })()
  return loading
}

/** Every terrain of the library: GFit's (as far as read; one this browser saved over shows as this browser's), then this browser's newest first. */
export function libraryTerrains(): LibraryTerrainEntry[] {
  const mine = browserTerrains.list().sort((a, b) => b.savedAt - a.savedAt)
  const ids = new Set(mine.map((t) => t.id))
  const gfit = (useTerrainLibrary.getState().gfit ?? []).filter((t) => !ids.has(t.id))
  return [...gfit.map((terrain) => ({ terrain, shelf: 'gfit' as const })), ...mine.map((terrain) => ({ terrain, shelf: 'browser' as const }))]
}

export const libraryTerrain = (id: Id) => libraryTerrains().find((e) => e.terrain.id === id)

const bump = () => useTerrainLibrary.setState((s) => ({ count: s.count + 1 }))

/** Keeps `t` in this browser's shelf; false when the storage is full or blocked. */
export function saveTerrain(t: LibraryTerrain): boolean {
  const ok = browserTerrains.save(t)
  if (ok) bump()
  return ok
}

/** Forgets one of this browser's terrains (a GFit terrain it was saved over shows again). */
export function removeTerrain(id: Id): void {
  if (browserTerrains.remove(id)) bump()
}
