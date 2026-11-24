import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { usePluginModes } from './src/plugins/settings.ts'
import { LAYERS_KEY, useLayerView } from './src/views/layers/layerView.ts'
import '@testing-library/jest-dom/vitest'

// We import describe/it/expect explicitly (no Vitest globals), so Testing Library
// does not auto-clean. Without this, every render would leak into the next test.
afterEach(cleanup)

// "Coming soon" (Decision "Coming soon"): the shipped list holds the optimizer and the agent back, and every test
// written before it runs as if nothing were; the tests of the held-back behaviour set `soon` back themselves.
beforeEach(() => usePluginModes.setState({ soon: {} }))

// What the viewer hides (views/layers/layerView.ts) is kept per project and in this browser: no test starts with something
// hidden by the one before, in memory or in storage.
beforeEach(() => {
  try {
    localStorage.removeItem(LAYERS_KEY)
  } catch {
    // a test with no storage
  }
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
})
