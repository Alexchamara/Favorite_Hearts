import { Component, type ReactNode } from 'react';
import { Notice } from '@/components/layout';

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
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <Notice tone="error" title="Something went wrong on this page">
          <p>Reload to try again. If it keeps happening, please contact us.</p>
          <p className="mt-3 flex flex-wrap gap-4">
            <button type="button" className="underline underline-offset-4" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a className="underline underline-offset-4" href="/app/">
              Go to your profiles
            </a>
          </p>
        </Notice>
      </main>
    );
  }
}
