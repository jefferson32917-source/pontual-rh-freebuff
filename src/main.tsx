import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { installChunkRecovery } from './lib/chunkRecovery'
import './index.css'

// Recupera automaticamente de chunk obsoleto após deploy (reload 1x)
installChunkRecovery()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// PWA: registra o service worker (offline shell + instalação)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // falha silenciosa: app continua funcionando online-only
    })
  })
}
