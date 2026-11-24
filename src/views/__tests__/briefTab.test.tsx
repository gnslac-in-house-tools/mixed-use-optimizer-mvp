// Labels in Show (Decision "Show fixed"; in the drafting bar's Overlays since Decision "Bottom bar"). The old Brief tab's steppers went with it (Decision "Brief tab").
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { overlayOn, toggleOverlay } from './overlays.ts'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { LABELS } from '../layers/keys.ts'
import { LAYERS_KEY } from '../layers/layerView.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useGraph.setState({ graph: false, rule: null, relation: null })
  useToast.setState({ toast: null, confirmation: null })
})


describe('Labels, a View › Overlays row and the Labels row of Layers (Decision "Show fixed")', () => {
  it('hides and shows the masses’ names and areas on the plan, remembered per project', () => {
    render(<App />)
    expect(document.querySelectorAll('[data-label]').length).toBeGreaterThan(0)
    expect(overlayOn('labels')).toBe(true)
    toggleOverlay('labels')
    expect(document.querySelectorAll('[data-label]')).toHaveLength(0)
    expect(overlayOn('labels')).toBe(false)
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)[useApp.getState().project.id].hidden).toEqual([LABELS])
    expect(localStorage.getItem('gfit.labels')).toBeNull()
    toggleOverlay('labels')
    expect(document.querySelectorAll('[data-label]').length).toBeGreaterThan(0)
  })
})
