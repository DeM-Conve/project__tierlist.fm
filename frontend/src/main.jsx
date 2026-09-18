import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import { ProgressProvider } from '@bprogress/react'
import { store } from './store/store.js'
import { theme } from './mantineTheme.js'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <BrowserRouter>
          <MantineProvider theme={theme} defaultColorScheme="dark" forceColorScheme="dark">
            <ProgressProvider color="#d6a24c" height="3px">
              <App />
            </ProgressProvider>
          </MantineProvider>
        </BrowserRouter>
      </Provider>
    </QueryClientProvider>
  </StrictMode>,
)
