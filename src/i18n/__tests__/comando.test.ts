import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerAll } from '../../views/commands/index.ts'
import { knownCommand, resetRegistry, runCommand } from '../../views/commands/registry.ts'
import { useIdioma } from '../idioma.ts'

beforeEach(() => { resetRegistry(); registerAll() })
afterEach(() => useIdioma.getState().poner('en'))

describe('View › Language', () => {
  it('Español y English cambian el idioma de la interfaz y marcan el que está puesto', () => {
    expect(knownCommand('view.idioma.es')?.menu).toEqual(['View', 'Language'])
    runCommand('view.idioma.es')
    expect(useIdioma.getState().idioma).toBe('es')
    expect(knownCommand('view.idioma.es')?.checked?.()).toBe(true)
    expect(knownCommand('view.idioma.en')?.checked?.()).toBe(false)
    runCommand('view.idioma.en')
    expect(useIdioma.getState().idioma).toBe('en')
  })
})
