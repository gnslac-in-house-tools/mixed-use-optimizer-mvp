import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Mass, Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { useInteriors } from '../../../views/show/interiors.ts'
import { InterioresNave } from '../views/InterioresNave.tsx'
import { interioresNave } from '../engine/interiores.ts'

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[]): Mass => ({
  id, name: id, levelId: 'l1', programId, height: 12, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
function proyecto(): Project {
  const p = newProject('industrial')
  return { ...p, masses: [masa('n1', 'warehouse', rect(0, 0, 160, 80)), masa('o1', 'office', rect(160, 0, 180, 20))] }
}

beforeEach(() => {
  const p = proyecto()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
})

describe('el interior de las naves en planta', () => {
  it('Programs dibuja maniobras y almacenaje de cada nave; Furniture, sus racks; la oficina, nada', () => {
    act(() => useInteriors.setState({ interiors: true, furniture: true }))
    const d = useApp.getState().derived
    const docks = d.circulation.docks.filter((k) => k.massId === 'n1')
    const esperado = interioresNave(d.masses.n1.polygon, docks, 0)
    const { container } = render(<svg><InterioresNave /></svg>)
    expect(container.querySelectorAll('[data-nave]').length).toBe(1)
    expect(container.querySelectorAll('path[data-almacen]').length).toBe(esperado.almacen.length)
    expect(container.querySelectorAll('path[data-maniobras]').length).toBe(esperado.maniobras.length)
    expect(container.querySelector('path[data-racks]')?.getAttribute('data-racks')).toBe(String(esperado.racks.length))
    expect(container.querySelector('path[data-racks]')?.getAttribute('d')?.match(/M/g)?.length).toBe(esperado.racks.length)
    expect(esperado.racks.length).toBeGreaterThan(0)
  })

  it('solo las naves de la opción que se ve', () => {
    act(() => useInteriors.setState({ interiors: true, furniture: true }))
    const p0 = proyecto()
    const otro = { ...p0.buildings[0], id: 'b2', levels: [{ ...p0.buildings[0].levels[0], id: 'l2' }] }
    const p: Project = {
      ...p0, buildings: [...p0.buildings, otro],
      options: [...p0.options, { ...p0.options[0], id: 'o2', name: 'B', buildingIds: ['b2'] }],
      masses: [...p0.masses, { ...masa('n2', 'warehouse', rect(0, 200, 100, 260)), levelId: 'l2' }],
    }
    act(() => useApp.setState({ project: p, derived: derive(p), option: 'o1' }))
    const { container } = render(<svg><InterioresNave /></svg>)
    expect([...container.querySelectorAll('[data-nave]')].map((e) => e.getAttribute('data-nave'))).toEqual(['n1'])
  })

  it('con Programs y Furniture apagados no dibuja nada', () => {
    act(() => useInteriors.setState({ interiors: false, furniture: false }))
    const { container } = render(<svg><InterioresNave /></svg>)
    expect(container.querySelectorAll('[data-nave]').length).toBe(0)
  })
})
