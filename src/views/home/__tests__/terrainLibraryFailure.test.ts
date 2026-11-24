// GFit's terrains when one of them cannot be read (Decision "Home libraries"): a starter's chunk gone after a deploy
// loses that terrain alone, the others show, and a later call tries the missing one again.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const starter = vi.fn(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
vi.mock('../starters.ts', () => ({ STARTERS: { 'industrial-quezaltepeque-demo': () => starter() } }))

const { libraryTerrains, loadGfitTerrains, useTerrainLibrary } = await import('../terrainLibrary.ts')

beforeEach(() => localStorage.clear())

describe('terrain library, one GFit terrain not read', () => {
  it('the others show; the read ends; a later call tries again', async () => {
    await expect(loadGfitTerrains()).resolves.toBeUndefined()
    expect(useTerrainLibrary.getState().gfit).not.toBeNull()
    expect(libraryTerrains().map((e) => e.terrain.id)).toEqual(['gfit-industrial-park'])
    await loadGfitTerrains()
    expect(starter).toHaveBeenCalledTimes(2)
  })
})
