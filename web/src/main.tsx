import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './styles.css'
import '@google/model-viewer'

registerSW({ immediate: true })
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.ready.then((registration) => registration.update())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
