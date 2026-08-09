import { Component } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

/**
 * Catches render errors in whatever screen is currently showing.
 *
 * Wraps only the routed content, not the whole shell — so if a bug in one
 * screen throws (exactly what just happened: a plain ReferenceError during
 * render, with nothing anywhere to catch it), the top bar and bottom tabs
 * stay alive and clickable. Tapping any tab is itself an escape hatch,
 * before the person even reads this fallback.
 *
 * Without a boundary, React unmounts the entire tree on any render error —
 * a blank screen with nothing on it to tap, which is what "black screen, no
 * way back" actually was.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Daybook caught a render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="page">
        <div className="crash-card">
          <AlertTriangle size={26} style={{ color: 'var(--out)' }} />
          <h1 className="page-title serif" style={{ fontSize: 20 }}>Something broke on this screen</h1>
          <p className="page-sub">
            The rest of the app is fine — the tabs below still work. Try again, or head back
            to Today.
          </p>
          <div className="crash-actions">
            <button
              className="btn btn-outline btn-md"
              onClick={() => this.setState({ error: null })}
            >
              <RotateCcw size={15} /> Try again
            </button>
            <button
              className="btn btn-primary btn-md"
              onClick={() => { window.location.href = '/'; }}
            >
              <Home size={15} /> Back to Today
            </button>
          </div>
          <details className="crash-detail">
            <summary>Technical detail</summary>
            <pre>{String(this.state.error?.stack || this.state.error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
