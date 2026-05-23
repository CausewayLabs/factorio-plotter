import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { initSolver } from './solver/reactivity'

// Wire the solver to the scene store — must be called before any store mutations
initSolver()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
