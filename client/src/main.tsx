import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV) {
  void import('@axe-core/react').then((axe) => axe.default(React, ReactDOM, 1000))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Real URLs rather than hashes: the registration link the server hands
        out is an ordinary path, and a QR code encoding a `#` would be a
        needless oddity to scan. */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
