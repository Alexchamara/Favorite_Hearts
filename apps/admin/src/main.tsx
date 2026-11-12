import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { EnglishOnly, I18nProvider } from '@/lib/i18n';
import { initTheme } from '@/lib/theme';
import App from './App';
import { queryClient } from './lib/query-client';
// The member app's design system, in its own order (apps/member/src/main.tsx), so the admin site looks the same.
import './styles/admin.css';
import '@/styles/fonts.css';
import '@/styles/source/product.css';
import '@/styles/source/overrides.css';
import '@/styles/source/contrast.css';
import '@/styles/source/combined-overrides.css';
import '@/styles/source/design-system.css';
import '@/styles/source/base.css';
import '@/styles/parity.css';

initTheme();

// Staff screens are in English (owner, 3 Nov 2026). The demo's stylesheets are scoped to these two wrappers.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <EnglishOnly>
          <BrowserRouter>
            <div id="favorite-hearts-preview">
              <div id="favorite-hearts-product">
                <App />
              </div>
            </div>
          </BrowserRouter>
        </EnglishOnly>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
