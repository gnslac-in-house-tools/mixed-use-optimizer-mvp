// Entry of the state graph page (state-graph.html, dev only). Same tokens and base CSS as the app.
import '@fontsource-variable/inter'
import '../../styles/tokens.css'
import '../../styles/global.css'
import '@xyflow/react/dist/style.css'
import './graph.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme } from '../../views/layout/theme.ts'
import { readSaved, STORAGE_KEY } from '../../views/layout/ui.ts'
import { StateGraph } from './StateGraph.tsx'

// the app's theme (Decision "Dark mode"): this tab follows when the app's tab changes it
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) applyTheme(readSaved().theme)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StateGraph />
  </StrictMode>,
)
