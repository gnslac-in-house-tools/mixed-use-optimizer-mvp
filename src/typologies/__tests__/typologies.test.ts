import { describe, expect, it } from 'vitest'
import { ProjectSchema } from '../../model/schema.ts'
import { newProject, TYPOLOGIES } from '../index.ts'

describe('typologies', () => {
  it('every template produces a valid project', () => {
    for (const t of TYPOLOGIES) expect(ProjectSchema.safeParse(newProject(t.id)).success).toBe(true)
  })

  it('a project copies the template, so editing it never changes the template', () => {
    const p = newProject('industrial')
    p.programs[0].name = 'Changed'
    p.site.rules.setback = 99
    expect(newProject('industrial').programs[0].name).toBe('Warehouse')
    expect(newProject('industrial').site.rules.setback).toBe(10)
  })

  it('every typology offers the warehouse module (its buildings are blocks, Phase D.2); only the industrial offers its docks', () => {
    for (const t of TYPOLOGIES) expect(t.modules, t.id).toContain('warehouse')
    expect(TYPOLOGIES.find((t) => t.id === 'blank')!.modules).toEqual(['warehouse', 'terrain', 'parking'])
    expect(TYPOLOGIES.filter((t) => t.modules.includes('docks')).map((t) => t.id)).toEqual(['industrial'])
  })

  it('rejects an unknown typology', () => {
    expect(() => newProject('nope')).toThrow('Unknown typology')
  })
})
