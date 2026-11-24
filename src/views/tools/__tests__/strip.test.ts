// The Tools strip's groups (AS.2, `tools/strip.ts`): the registry's commands that carry `tool`, by group, in the spec's order:
// the Tools menu's own first (in its order), then the others (Group, from Edit, ends General). A group with no command is left out
// (a typology without the warehouse or the parking module); each command has a hint, an icon the app draws and its key.
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { TYPOLOGIES } from '../../../typologies/index.ts'
import { registerAll } from '../../commands/index.ts'
import { commandOf } from '../../commands/registry.ts'
import { ICON_PATHS } from '../../controls/Icon.tsx'
import { stripGroups, TOOL_GROUPS } from '../strip.ts'

const setTypology = (typology: string) => useApp.setState({ project: { ...useApp.getState().project, typology } })
const ids = (key: string) => stripGroups().find((g) => g.key === key)?.commands.map((c) => c.id)

beforeEach(() => {
  localStorage.clear()
  registerAll()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), option: 'o1' })
})

describe('the strip’s groups', () => {
  it('six groups in the spec’s order, named', () => {
    expect(TOOL_GROUPS.map((g) => g.key)).toEqual(['general', 'massing', 'elements', 'streets', 'parking', 'annotations'])
    expect(TOOL_GROUPS.map((g) => g.label)).toEqual(['General', 'Massing', 'Elements', 'Streets', 'Parking', 'Annotations'])
  })

  it('gives each group today’s tools, in order, Group last in General', () => {
    expect(stripGroups().map((g) => g.key)).toEqual(['general', 'massing', 'elements', 'streets', 'parking', 'annotations'])
    expect(ids('general')).toEqual(['tool.select', 'tool.move', 'tool.copy', 'tool.rotate', 'tool.mirror', 'tool.array', 'tool.align', 'edit.group'])
    expect(ids('massing')).toEqual(['tool.mass', 'tool.hole', 'tool.corner', 'tool.chamfer', 'tool.split', 'tool.union'])
    expect(ids('elements')).toEqual(['tool.dock', 'tool.door', 'tool.pattern', 'tool.court'])
    expect(ids('streets')).toEqual(['tool.street', 'tool.gate', 'tool.existing-road', 'tool.connect'])
    expect(ids('parking')).toEqual(['tool.lot'])
    expect(ids('annotations')).toEqual(['tool.dimension', 'tool.ruler', 'tool.referenceLine', 'tool.note'])
  })

  it('every command it gives is in the registry, with a hint, an icon the app draws and the group it stands in', () => {
    for (const g of stripGroups()) {
      for (const c of g.commands) {
        expect(commandOf(c.id), c.id).toBe(c)
        expect(c.tool!.group, c.id).toBe(g.key)
        expect(c.tool!.hint.length, `${c.id}: hint`).toBeGreaterThan(10)
        expect(ICON_PATHS[c.tool!.icon], `${c.id}: ${c.tool!.icon}`).toBeTruthy()
      }
    }
  })

  it('a hint is one sentence: no key in it, no key in brackets', () => {
    for (const g of stripGroups()) for (const c of g.commands) expect(c.tool!.hint, c.id).not.toMatch(/\((?:Ctrl\+)?[A-Z]\)$/)
  })

  it('Union, Connect and Group do something once; every other tool is taken and let go', () => {
    const once = stripGroups().flatMap((g) => g.commands).filter((c) => c.tool!.once).map((c) => c.id)
    expect(new Set(once)).toEqual(new Set(['edit.group', 'tool.union', 'tool.connect']))
    for (const g of stripGroups()) for (const c of g.commands) if (!c.tool!.once) expect(c.checked, c.id).toBeTypeOf('function')
  })

  it('the icons the plan lists: Pattern and Existing road have their own, the others are as they were', () => {
    const icon = (id: string) => commandOf(id)!.tool!.icon
    expect(['tool.select', 'tool.move', 'tool.copy', 'tool.rotate', 'tool.mirror', 'tool.array', 'tool.align', 'edit.group'].map(icon)).toEqual(['cursor', 'move', 'duplicate', 'rotate', 'mirror', 'array', 'align', 'group'])
    expect(['tool.mass', 'tool.hole', 'tool.corner', 'tool.chamfer', 'tool.union'].map(icon)).toEqual(['mass', 'hole', 'corner', 'chamfer', 'union'])
    expect(['tool.dock', 'tool.door', 'tool.pattern', 'tool.court'].map(icon)).toEqual(['dock', 'door', 'pattern', 'truck'])
    expect(['tool.street', 'tool.gate', 'tool.existing-road', 'tool.connect'].map(icon)).toEqual(['road', 'gate', 'existingRoad', 'link'])
    expect(['tool.lot', 'tool.dimension', 'tool.ruler', 'tool.referenceLine', 'tool.note'].map(icon)).toEqual(['parking', 'dimension', 'ruler', 'referenceLine', 'note'])
  })

  it('no Elements group without the warehouse module, no Parking without the parking module; the blank typology offers both (its blocks have Door and Pattern)', () => {
    setTypology('blank')
    expect(stripGroups().map((g) => g.key)).toEqual(['general', 'massing', 'elements', 'streets', 'parking', 'annotations'])
    // no Dock and no Court where the typology has no docks
    expect(ids('elements')).toEqual(['tool.door', 'tool.pattern'])
    const bare = { ...TYPOLOGIES[0], id: 'no-warehouse-test', modules: ['terrain', 'parking'] }
    const only = { ...TYPOLOGIES[0], id: 'warehouse-only-test', modules: ['warehouse'] }
    TYPOLOGIES.push(bare, only)
    try {
      setTypology('no-warehouse-test')
      expect(stripGroups().map((g) => g.key)).toEqual(['general', 'massing', 'streets', 'parking', 'annotations'])
      setTypology('warehouse-only-test')
      expect(stripGroups().map((g) => g.key)).toEqual(['general', 'massing', 'elements', 'streets', 'annotations'])
    } finally {
      TYPOLOGIES.pop()
      TYPOLOGIES.pop()
    }
  })
})
