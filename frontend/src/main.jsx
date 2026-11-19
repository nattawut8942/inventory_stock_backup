import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import '@fontsource/sarabun/400.css'
import '@fontsource/sarabun/600.css'
import '@fontsource/sarabun/700.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('app')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
