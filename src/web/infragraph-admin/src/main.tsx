import '@fontsource-variable/vazirmatn/wght.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppProviders } from './app/providers'
import './shared/styles/global.css'
import './shared/styles/components.css'
import './shared/styles/layout.css'
import './shared/styles/tables.css'
import './shared/styles/error.css'
import './shared/styles/topology.css'
import './shared/styles/workstation.css'
import './shared/styles/primitives.css'
import './shared/styles/studio.css'
import './shared/styles/studio-operator.css'
import './shared/styles/access.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders><App /></AppProviders>
  </React.StrictMode>,
)