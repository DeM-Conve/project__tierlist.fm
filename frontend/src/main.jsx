import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
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
            <Notifications position="top-center" limit={3} zIndex={400} />
            <ProgressProvider color="#8b7cf6" height="3px" options={{ showSpinner: false }}>
              <App />
            </ProgressProvider>
          </MantineProvider>
        </BrowserRouter>
      </Provider>
    </QueryClientProvider>
  </StrictMode>,
)
