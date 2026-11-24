// The terrain library's shelves (Decision "Home libraries"): GFit's two (the sample's site and Quezaltepeque's, read
// once when first asked), then this browser's; one saved over a GFit terrain shadows it, removed it shows again.
import { beforeEach, describe, expect, it } from 'vitest'
import { libraryTerrains, loadGfitTerrains, removeTerrain, saveTerrain, useTerrainLibrary } from '../terrainLibrary.ts'

beforeEach(() => localStorage.clear())

describe('terrain library', { timeout: 15_000 }, () => {
  it('GFit’s two terrains, each with its boundary; Quezaltepeque’s with its survey’s contours', async () => {
    expect(useTerrainLibrary.getState().gfit).toBeNull()
    await loadGfitTerrains()
    const all = libraryTerrains()
    expect(all.map((e) => [e.terrain.id, e.terrain.name, e.shelf])).toEqual([
      ['gfit-industrial-park', 'Industrial park', 'gfit'],
      ['gfit-quezaltepeque', 'Quezaltepeque, El Salvador', 'gfit'],
    ])
    expect(all.every((e) => e.terrain.site.boundary)).toBe(true)
    expect(all[1].terrain.site.terrain!.contours.length).toBeGreaterThan(10)
  })

  it('this browser’s after GFit’s; one saved over a GFit terrain shadows it until removed', async () => {
    await loadGfitTerrains()
    const [park] = libraryTerrains()
    const count = useTerrainLibrary.getState().count
    expect(saveTerrain({ ...park.terrain, name: 'My park', version: 2, savedAt: 9 })).toBe(true)
    expect(useTerrainLibrary.getState().count).toBe(count + 1)
    expect(libraryTerrains().map((e) => [e.terrain.name, e.shelf])).toEqual([
      ['Quezaltepeque, El Salvador', 'gfit'],
      ['My park', 'browser'],
    ])
    removeTerrain(park.terrain.id)
    expect(libraryTerrains().map((e) => e.terrain.name)).toEqual(['Industrial park', 'Quezaltepeque, El Salvador'])
  })
})
