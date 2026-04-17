import { Component, type ReactNode } from "react";
import { Pond } from "./components/Pond";
import type { PersistedDetachedItem } from "./lib/session-types";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: 'red', padding: 20, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h1>Render Error</h1>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App({
  initialPaneIds,
  restoredLayout,
  initialDetached,
  baseboardNotice,
}: {
  initialPaneIds?: string[];
  restoredLayout?: unknown;
  initialDetached?: PersistedDetachedItem[];
  baseboardNotice?: ReactNode;
}) {
  return (
    <ErrorBoundary>
      <Pond initialPaneIds={initialPaneIds} restoredLayout={restoredLayout} initialDetached={initialDetached} baseboardNotice={baseboardNotice} />
    </ErrorBoundary>
  );
}
