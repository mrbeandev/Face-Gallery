import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useSettingsStore } from './store/settingsStore'

function applyBackendQueryParameter() {
  const url = new URL(window.location.href);
  const backend = url.searchParams.get('backend');

  if (backend !== null) {
    try {
      const backendUrl = new URL(backend);
      if (backendUrl.protocol === 'http:' || backendUrl.protocol === 'https:') {
        useSettingsStore.getState().setBackendUrl(backendUrl.toString());
      }
    } catch {
      // Ignore invalid backend parameters
    }

    url.searchParams.delete('backend');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
}

applyBackendQueryParameter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
