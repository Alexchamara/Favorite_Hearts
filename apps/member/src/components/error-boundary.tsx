import { Component, type ReactNode } from 'react';
import { AppLoading } from '@/components/layout';
import { say } from '@/lib/i18n';

/**
 * When a screen fails to render, show a way out instead of a blank page. React reports the error
 * to the console. Key it by the route so that moving to another page starts afresh.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // The demo's load-error page (.m-app.m-loading with its alert and a button), not a bare notice outside .m-app.
    return (
      <AppLoading title={say('errorPage.title')} alert={say('errorPage.body')}>
        <button type="button" className="m-btn" onClick={() => window.location.reload()}>
          {say('errorPage.reload')}
        </button>
        <a className="m-text" href="/app/">
          {say('errorPage.home')}
        </a>
      </AppLoading>
    );
  }
}
