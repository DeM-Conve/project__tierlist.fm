import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { MantineProvider } from '@mantine/core'
import { store } from './store/store.js'
import { theme } from './mantineTheme.js'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <MantineProvider theme={theme} defaultColorScheme="dark" forceColorScheme="dark">
        <App />
      </MantineProvider>
    </Provider>
  </StrictMode>,
)
