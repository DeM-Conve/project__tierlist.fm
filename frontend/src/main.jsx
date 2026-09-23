import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Notifications } from '@mantine/notifications'
import { ProgressProvider } from '@bprogress/react'
import { store } from './store/store.js'
import { applyCssVars, buildAppearance } from './themes.js'
import './index.css'
import App from './App.jsx'
import AppearanceRoot from './components/AppearanceRoot.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Every YouTube read costs API quota (10,000 units/day for the whole
      // app), so data is never refetched just because a page remounted:
      // it stays until this app changes it (each write invalidates or
      // patches the queries it touched) or the page is reloaded.
      staleTime: Infinity,
    },
  },
})

// Apply the saved look before the first paint, so there's no flash of the
// default theme on reload.
applyCssVars(buildAppearance(store.getState().appearance).cssVars)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <BrowserRouter>
          <AppearanceRoot>
            <Notifications position="top-center" limit={3} zIndex={400} />
            <ProgressProvider color="var(--accent)" height="3px" options={{ showSpinner: false }}>
              <App />
            </ProgressProvider>
          </AppearanceRoot>
        </BrowserRouter>
      </Provider>
    </QueryClientProvider>
  </StrictMode>,
)
