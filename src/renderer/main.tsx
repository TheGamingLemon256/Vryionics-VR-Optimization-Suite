import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { installRendererLogForwarder } from './logger'

// Route renderer console + uncaught errors to the main-process log file
// before React mounts, so even mount-time crashes land in bug reports.
installRendererLogForwarder()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
