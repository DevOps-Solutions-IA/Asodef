import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { ServiceUnavailablePage } from "../../pages/errors/ServiceUnavailablePage";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort boundary wrapping the whole app, for errors that occur
 * outside any single route's subtree (e.g. in a context provider or the
 * router itself). React error boundaries must be class components - there
 * is no hooks-based equivalent. Deliberately does not log error.stack/
 * error.message anywhere a user could see it; componentDidCatch is the
 * place a real error-monitoring integration (e.g. Sentry) would report
 * the raw error server-side/to a monitoring service, once one exists.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Intentionally empty for now - wire to an error-monitoring service
    // here when one is introduced. Never console.log the raw error in a
    // way a screen-sharing session or production console could expose it.
  }

  override render() {
    if (this.state.hasError) {
      return <ServiceUnavailablePage onRetry={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
