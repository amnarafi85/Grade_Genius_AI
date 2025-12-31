import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Set the browser tab title once at startup
document.title = 'AI Garder'

// (Optional) Also set an iOS home-screen title
const meta = document.createElement('meta')
meta.name = 'apple-mobile-web-app-title'
meta.content = 'AI Garder'
document.head.appendChild(meta)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
