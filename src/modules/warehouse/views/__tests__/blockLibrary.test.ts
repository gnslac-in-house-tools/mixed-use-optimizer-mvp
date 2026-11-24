// The library's shelves (Decision "Block library"): GFit's (the sample's blocks) for everyone, this browser's beside
// them; one saved over a GFit block shadows it here, removed it shows again; a block that does not read is left out.
import { beforeEach, describe, expect, it } from 'vitest'
import { BLOCKS_KEY } from '../../../../io/blocks.ts'
import { gfitBlocks, libraryBlock, libraryBlocks, removeBlock, saveBlock, useBlockLibrary } from '../blockLibrary.ts'

beforeEach(() => localStorage.clear())

describe('the block library', () => {
  it('GFit’s: the sample’s Cross-dock and Rear-load, at version 1; its Guard house and Outdoor storage stay in the sample', () => {
    expect(gfitBlocks().map((b) => [b.id, b.version])).toEqual([
      ['gfit-cross-dock', 1],
      ['gfit-rear-load', 1],
    ])
    expect(libraryBlocks().map((e) => e.shelf)).toEqual(['gfit', 'gfit'])
  })

  it('a GFit block saved over in this browser shadows it; removed, GFit’s shows again; each change bumps the count', () => {
    const count = useBlockLibrary.getState().count
    const gfit = gfitBlocks()[0]
    expect(saveBlock({ ...gfit, version: 2, type: { ...gfit.type, name: 'Cross-dock XL' } })).toBe(true)
    expect(useBlockLibrary.getState().count).toBe(count + 1)
    expect(libraryBlock('gfit-cross-dock')).toMatchObject({ shelf: 'browser', block: { version: 2 } })
    expect(libraryBlocks()).toHaveLength(2)
    removeBlock('gfit-cross-dock')
    expect(libraryBlock('gfit-cross-dock')).toMatchObject({ shelf: 'gfit', block: { version: 1 } })
  })

  it('a block that does not read is left out', () => {
    localStorage.setItem(BLOCKS_KEY, JSON.stringify([{ format: 'gfit-block', id: 'x' }, { ...gfitBlocks()[1], id: 'mine' }]))
    expect(libraryBlocks().map((e) => e.block.id).sort()).toEqual(['gfit-cross-dock', 'gfit-rear-load', 'mine'])
  })
})
