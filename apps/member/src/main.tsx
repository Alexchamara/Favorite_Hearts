import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import App from './App';
import { I18nProvider } from './lib/i18n';
import { queryClient } from './lib/query-client';
import { initTheme } from './lib/theme';
// The demo's cascade, in its build order (docs/UI-PARITY.md): Tailwind and tokens, then its product stylesheet scoped
// to #favorite-hearts-product, then its unscoped overrides, ending with the design system. parity.css holds the
// repository's own corrections and loads last.
import './styles/index.css';
import './styles/fonts.css';
import './styles/source/product.css';
import './styles/source/overrides.css';
import './styles/source/contrast.css';
import './styles/source/combined-overrides.css';
import './styles/source/design-system.css';
import './styles/source/base.css';
import './styles/parity.css';

initTheme();

// The demo's two wrappers: its stylesheets are scoped to these ids.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter basename="/app">
          <div id="favorite-hearts-preview">
            <div id="favorite-hearts-product">
              <App />
            </div>
          </div>
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
