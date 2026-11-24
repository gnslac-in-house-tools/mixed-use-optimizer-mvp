// A block's file (Phase BL.5, Decision "Block library"): Export writes a .gfb that reads back as the same block;
// Import brings one into this browser's shelf, unless the library has it at that version or later; a file that is not
// a block says so.
import { beforeEach, describe, expect, it } from 'vitest'
import { blockFileName, readBlockFile, writeBlockFile } from '../../../io/blocks.ts'
import { gfitBlocks, libraryBlock } from '../../../modules/warehouse/views/blockLibrary.ts'
import { useToast } from '../../layout/toast.ts'
import { importBlock } from '../BlockLibraryView.tsx'

const file = (text: string, name = 'x.gfb') => new File([text], name, { type: 'application/json' })

beforeEach(() => {
  localStorage.clear()
  useToast.setState({ toast: null, confirmation: null })
})

describe('a block’s file', () => {
  it('written, it reads back as the same block; named after it', () => {
    const b = gfitBlocks()[0]
    expect(readBlockFile(writeBlockFile(b))).toEqual({ ok: true, block: b })
    expect(blockFileName(b)).toBe('cross-dock.gfb')
    expect(readBlockFile('{nope')).toEqual({ ok: false, error: 'it is not JSON' })
    expect(readBlockFile('{"format":"gfit"}')).toEqual({ ok: false, error: 'it is not a GFit block' })
  })

  it('imported: a newer version comes into this browser’s blocks; the same version, not again; not a block, it says so', async () => {
    const b = gfitBlocks()[1]
    await importBlock(file(writeBlockFile(b)))
    expect(useToast.getState().toast?.text).toMatch(/in the library already \(version 1\)/)
    expect(libraryBlock(b.id)!.shelf).toBe('gfit')

    await importBlock(file(writeBlockFile({ ...b, version: 3, type: { ...b.type, name: 'Rear-load 3' } })))
    expect(libraryBlock(b.id)).toMatchObject({ shelf: 'browser', block: { version: 3 } })

    await importBlock(file('[]', 'bad.gfb'))
    expect(useToast.getState().toast).toMatchObject({ kind: 'error', text: 'Could not upload bad.gfb: it is not a GFit block.' })
  })
})
