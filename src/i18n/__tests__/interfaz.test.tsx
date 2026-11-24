import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { useApp } from '../../state/store.ts'
import { registerAll } from '../../views/commands/index.ts'
import { resetRegistry } from '../../views/commands/registry.ts'
import { MenuBar } from '../../views/layout/MenuBar.tsx'
import { useIdioma } from '../idioma.ts'

beforeEach(() => {
  resetRegistry()
  registerAll()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p) })
})
afterEach(() => useIdioma.getState().poner('en'))

describe('la interfaz en español', () => {
  it('la barra de menús y sus comandos se leen en español', () => {
    act(() => useIdioma.getState().poner('es'))
    render(<MenuBar />)
    const barra = screen.getByRole('menubar')
    for (const m of ['Archivo', 'Edición', 'Ver', 'Sitio', 'Diseño', 'Herramientas', 'Ayuda']) expect(within(barra).getByText(m)).toBeInTheDocument()
    fireEvent.click(within(barra).getByText('Edición'))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('Deshacer')).toBeInTheDocument()
    expect(within(menu).getByText('Rehacer')).toBeInTheDocument()
  })

  it('en inglés, como siempre', () => {
    render(<MenuBar />)
    expect(within(screen.getByRole('menubar')).getByText('File')).toBeInTheDocument()
  })
})
