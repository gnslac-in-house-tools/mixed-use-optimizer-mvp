// Entry point: the browser loads index.html, which loads this file.
// Order matters: font, then tokens (CSS variables), then global styles that use them.
import '@fontsource-variable/inter'
import './styles/tokens.css'
import './styles/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { useApp } from './state/store.ts'
import { connectTraceChannel } from './state/trace/channel.ts'
import { snapshot } from './state/trace/tracer.ts'
import { SAMPLE_ID } from './state/sample.ts'
import { followSample } from './views/home/sample.ts'
import { seedStarters } from './views/home/starters.ts'
import { followBlockEditor } from './views/home/blockEditor.ts'
import { startScreen, useScreen } from './views/home/screen.ts'
import { openKept, openSample } from './views/layout/files.ts'
import { returnFromSpeckle } from './views/layout/speckleReturn.ts'
import { useTour } from './views/tour/tour.ts'
import { useIdioma } from './i18n/idioma.ts' // mixed-use-mvp

// dev only: store calls and the live data go out to the /state-graph page
if (import.meta.env.DEV) {
  const disconnect = connectTraceChannel(() => snapshot(useApp.getState()))
  window.addEventListener('pagehide', disconnect)
}

// the starter projects this browser has not been given yet (Decision "Starter projects"), before Home lists them
await seedStarters()

// back from Speckle's login (Decision "Speckle sign-in"): the address as GFit had it, before the screen reads it
void returnFromSpeckle()

// Home or the project the address names (Decision "Home"); the sample, as it opens, holds the agent back and offers
// the tour (Decision "Sample project")
followSample()
// the block editor from Home (Phase BL.4): its window closing goes back Home
followBlockEditor()
startScreen((id) => {
  if (id !== SAMPLE_ID) return openKept(id)
  openSample()
  return true
})
if (!useScreen.getState().home && useApp.getState().project.id === SAMPLE_ID && !useTour.getState().active) useTour.getState().setOffer(true)

// mixed-use-mvp: al cambiar el idioma (View › Language) la app se vuelve a montar, así que cada texto pasa otra vez por t()
function Raiz() {
  const idioma = useIdioma((s) => s.idioma)
  return <App key={idioma} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
