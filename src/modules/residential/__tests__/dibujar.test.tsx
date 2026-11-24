// En Uso mixto, Dibujar hace una masa libre en el edificio del nivel elegido (gancho de DrawMass, mixed-use-mvp), no un
// block de bodega: la torre y su núcleo quedan en el mismo edificio.
import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { useToast } from '../../../views/layout/toast.ts'
import { useUi } from '../../../views/layout/ui.ts'
import { UNMEASURED_SIZE } from '../../../views/plan/camera.ts'
import { DEFAULT_SNAP } from '../../../views/plan/snap/kinds.ts'
import { useSnapSettings } from '../../../views/plan/snap/settings.ts'
import { useMassProgram } from '../../../views/plan/tools/toolState.ts'
import { letGo } from '../../../views/tools/hand.ts'

vi.mock('../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const capture = () => document.querySelector('[data-capture]')!
const s = () => useApp.getState()

beforeEach(() => {
  localStorage.clear()
  const p = newProject('mixed-use')
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  letGo()
  useMassProgram.setState({ programId: undefined })
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useToast.setState({ toast: null, confirmation: null })
})

describe('Dibujar en Uso mixto', () => {
  it('un arrastre hace una masa libre de Vivienda en el edificio del nivel elegido, sin tipo de bodega', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'b' })
    const el = capture()
    const r = el.getBoundingClientRect()
    const cx = (r.width || UNMEASURED_SIZE.w) / 2
    const cy = (r.height || UNMEASURED_SIZE.h) / 2
    fireEvent.pointerDown(el, { clientX: cx - 60, clientY: cy - 30, button: 0, pointerId: 1 })
    fireEvent.pointerMove(el, { clientX: cx, clientY: cy, button: 0, pointerId: 1 })
    fireEvent.pointerMove(el, { clientX: cx + 60, clientY: cy + 30, button: 0, pointerId: 1 })
    fireEvent.pointerUp(el, { clientX: cx + 60, clientY: cy + 30, button: 0, pointerId: 1 })
    const p = s().project
    expect(p.masses).toHaveLength(1)
    const m = p.masses[0]
    expect(m.part).toBeUndefined()
    expect(m.programId).toBe('vivienda')
    expect(m.levelId).toBe('l1')
    expect(p.warehouseTypes ?? []).toHaveLength(0)
    expect(p.buildings).toHaveLength(1)
    expect(s().selection.massId).toBe(m.id)
    expect(s().history.past).toHaveLength(1)
  })
})
