/** React entry — mounts <App/> and pulls in all stylesheet layers. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Stylesheet order matters: tokens first, then globals, then components.
import './styles/tokens.css'
import './styles/global.css'
import './styles/panel.css'
import './styles/item.css'
import './styles/settings.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root element not found')

const root = createRoot(container)

if (window.location.hash === '#onboarding' || window.location.hash === '#/onboarding' || window.location.hash.includes('onboarding')) {
  // The tutorial is only opened once. Keep its component (and its video UI)
  // out of the always-running panel renderer.
  void import('./Onboarding').then(({ Onboarding }) => {
    root.render(
      <StrictMode>
        <Onboarding />
      </StrictMode>
    )
  })
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
