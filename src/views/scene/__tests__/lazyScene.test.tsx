// Ported from Plaza-Practiko `vistas/tresd/__tests__/escenaPerezosa.test.tsx`.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LazyScene } from '../LazyScene.tsx'

vi.mock('../Scene.tsx', () => {
  throw new Error('no network')
})

describe('lazy 3D', () => {
  it('if the 3D cannot be downloaded, it says so in its place with "Retry" and the screen stays', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <p>the plan stays</p>
        <LazyScene />
      </div>,
    )
    expect(await screen.findByText(/Could not load the 3D view/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText('the plan stays')).toBeInTheDocument()
  })
})
