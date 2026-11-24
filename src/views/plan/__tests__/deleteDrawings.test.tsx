// Delete with a drawing picked (Phase DM.2, Decision "Drawings move"): the masses picked go, the drawing stays, and the
// notice says where a drawing is removed.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawingPart } from '../../../model/picked.ts'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { handleKey } from '../../useShortcuts.ts'
import { DRAWING_STAYS, deleteSelection } from '../massCommands.ts'

// drawings are picked on the plan from DM.3 on: here a stand-in picks one
const pickedDrawings: DrawingPart[] = []
vi.mock('../mix.ts', async (original) => {
  const real = await original<typeof import('../mix.ts')>()
  return { ...real, pickedNow: () => ({ ...real.pickedNow(), drawings: pickedDrawings }) }
})

const key = (k: string) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, target: document.body, preventDefault() {} }) as unknown as KeyboardEvent

beforeEach(() => {
  const p = demoProject()
  const withDrawing = { ...p, site: { ...p.site, drawings: [{ file: 'a.dxf', layers: [{ name: 'Walls', lines: [{ points: [{ x: 1, y: 0 }, { x: 5, y: 0 }] }] }] }] } }
  useApp.setState({ project: withDrawing, derived: derive(withDrawing), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  pickedDrawings.length = 0
  useToast.setState({ toast: null, confirmation: null })
})

describe('Delete with a drawing picked', () => {
  it('deletes the mass, leaves the drawing and tells where to remove it', () => {
    pickedDrawings.push({ file: 'a.dxf' })
    const before = useApp.getState().project.site.drawings
    useApp.getState().select('m1')
    deleteSelection()
    const after = useApp.getState().project
    expect(after.masses.some((m) => m.id === 'm1')).toBe(false)
    expect(after.site.drawings).toEqual(before)
    expect(useToast.getState().toast?.text).toBe('Remove a drawing from its row in Layers')
    expect(DRAWING_STAYS).toBe('Remove a drawing from its row in Layers')
  })

  it('the Del key says the same, with the mass or with the drawing alone', () => {
    pickedDrawings.push({ file: 'a.dxf', layer: 'Walls' })
    useApp.getState().select('m2')
    handleKey(key('Delete'))
    expect(useApp.getState().project.masses.some((m) => m.id === 'm2')).toBe(false)
    expect(useToast.getState().toast?.text).toBe(DRAWING_STAYS)
    useToast.setState({ toast: null, confirmation: null })
    useApp.getState().select(null)
    const n = useApp.getState().project.masses.length
    handleKey(key('Delete'))
    expect(useApp.getState().project.masses.length).toBe(n)
    expect(useApp.getState().project.site.drawings).toHaveLength(1)
    expect(useToast.getState().toast?.text).toBe(DRAWING_STAYS)
  })

  it('with no drawing picked it says nothing', () => {
    useApp.getState().select('m1')
    deleteSelection()
    expect(useToast.getState().toast).toBeNull()
  })
})
