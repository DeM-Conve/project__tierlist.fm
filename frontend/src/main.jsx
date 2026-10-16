import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { Notifications } from '@mantine/notifications'
import { ProgressProvider } from '@bprogress/react'
import { store } from './store/store.js'
import { applyCssVars, buildAppearance } from './themes.js'
import './index.css'
import App from './App.jsx'
import AppearanceRoot from './components/AppearanceRoot.jsx'
import QueryProvider from './api/QueryProvider.jsx'
import { createQueryClient } from './api/queryClient.js'
import { ROUTER_BASENAME } from './basePath.js'

// TanStack Query, with the board cache restored into it (api/boardCache.js).
const queryClient = createQueryClient()

// Apply the saved look before the first paint, so there's no flash of the
// default theme on reload.
applyCssVars(buildAppearance(store.getState().appearance).cssVars)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryProvider client={queryClient}>
      <Provider store={store}>
        {/* Routes live under the sub-path the app is served at, if any. */}
        <BrowserRouter basename={ROUTER_BASENAME}>
          <AppearanceRoot>
            <Notifications position="top-center" limit={3} zIndex={400} />
            <ProgressProvider color="var(--accent)" height="3px" options={{ showSpinner: false }}>
              <App />
            </ProgressProvider>
          </AppearanceRoot>
        </BrowserRouter>
      </Provider>
    </QueryProvider>
  </StrictMode>,
)
