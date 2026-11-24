// The KPI strip verbs: show, hide, move; nothing changed → the same project (no empty undo step).
import { describe, expect, it } from 'vitest'
import { chosenKpis } from '../../modules/catalog.ts'
import { newProject } from '../../typologies/index.ts'
import { hideKpi, moveKpi, setKpis, showKpi } from '../actions/kpis.ts'
import { setTerrain } from '../actions/site.ts'
import { demoProject } from '../demo.ts'

describe('KPI actions', () => {
  const p = setKpis(demoProject(), ['built-footprint', 'coverage', 'issues'])

  it('show adds at the end or at a position; already shown changes nothing', () => {
    expect(showKpi(p, 'site-area').kpis).toEqual(['built-footprint', 'coverage', 'issues', 'site-area'])
    expect(showKpi(p, 'site-area', 0).kpis).toEqual(['site-area', 'built-footprint', 'coverage', 'issues'])
    expect(showKpi(p, 'coverage')).toBe(p)
  })

  it('hide removes; a KPI not shown changes nothing', () => {
    expect(hideKpi(p, 'coverage').kpis).toEqual(['built-footprint', 'issues'])
    expect(hideKpi(p, 'site-area')).toBe(p)
  })

  it('move reorders; out of range or in place changes nothing', () => {
    expect(moveKpi(p, 2, 0).kpis).toEqual(['issues', 'built-footprint', 'coverage'])
    expect(moveKpi(p, 0, 2).kpis).toEqual(['coverage', 'issues', 'built-footprint'])
    expect(moveKpi(p, 1, 1)).toBe(p)
    expect(moveKpi(p, 0, 9)).toBe(p)
  })

  it('setKpis drops duplicates and keeps the same object when nothing changes; no choice yet starts from the default', () => {
    expect(setKpis(p, ['issues', 'issues']).kpis).toEqual(['issues'])
    expect(setKpis(p, ['built-footprint', 'coverage', 'issues'])).toBe(p)
    const none = { ...p, kpis: undefined }
    expect(showKpi(none, 'built-volume').kpis).toEqual(['built-footprint', 'coverage', 'site-area', 'issues', 'built-volume'])
  })
})

// A KPI of a module that is off (here the terrain's `cut`, no terrain on the site) is not shown, but it stays in the
// project's list: positions are among the KPIs shown, and the others keep their places (Decision "What is not there is
// not shown").
describe('KPI actions with a module off', () => {
  const p = { ...newProject('industrial'), kpis: ['gfa', 'cut', 'coverage'] }

  it('move counts only the KPIs shown; the one that is off keeps its place', () => {
    expect(chosenKpis(p)).toEqual(['gfa', 'coverage'])
    expect(moveKpi(p, 0, 1).kpis).toEqual(['coverage', 'cut', 'gfa'])
    expect(moveKpi(p, 1, 0).kpis).toEqual(['coverage', 'cut', 'gfa'])
    expect(moveKpi(p, 0, 2)).toBe(p) // there are two shown: the third is the one that is off
  })

  it('hide removes only that id', () => {
    expect(hideKpi(p, 'gfa').kpis).toEqual(['cut', 'coverage'])
    expect(hideKpi(p, 'cut')).toBe(p) // not shown: nothing to hide
  })

  it('show goes relative to the KPIs shown', () => {
    expect(showKpi(p, 'issues').kpis).toEqual(['gfa', 'cut', 'coverage', 'issues'])
    expect(showKpi(p, 'issues', 0).kpis).toEqual(['issues', 'gfa', 'cut', 'coverage'])
    expect(showKpi(p, 'issues', 1).kpis).toEqual(['gfa', 'cut', 'issues', 'coverage'])
    expect(showKpi(p, 'issues', 9).kpis).toEqual(['gfa', 'cut', 'coverage', 'issues'])
    expect(showKpi(p, 'coverage')).toBe(p)
    const again = showKpi(p, 'cut') // it is in the list already: never twice
    expect(again.kpis!.filter((id) => id === 'cut')).toHaveLength(1)
  })

  it('with its module on, the same KPI is one of the shown', () => {
    const t = setTerrain(p, { contours: [], points: [{ x: 0, y: 0, z: 100 }, { x: 10, y: 0, z: 101 }, { x: 0, y: 10, z: 102 }] })
    expect(chosenKpis(t)).toEqual(['gfa', 'cut', 'coverage'])
    expect(moveKpi(t, 0, 1).kpis).toEqual(['cut', 'gfa', 'coverage'])
    expect(hideKpi(t, 'cut').kpis).toEqual(['gfa', 'coverage'])
  })
})
