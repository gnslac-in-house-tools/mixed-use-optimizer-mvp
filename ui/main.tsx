import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// la tipografía y el sistema de GIM: autoalojados, sin peticiones a terceros
import '@fontsource-variable/inter/opsz.css'
import './styles/tokens.css'
import './styles/global.css'
import './app.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
