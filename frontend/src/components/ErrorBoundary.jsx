import React from 'react';
import { ShieldAlert, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
          <div className="max-w-md w-full rounded-2xl p-8 text-center space-y-6 animate-fade-in"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="inline-flex p-3 rounded-full" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <ShieldAlert className="h-10 w-10" style={{ color: 'var(--danger)' }} />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Something went wrong</h1>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                AgriConnect encountered an unexpected error. Diagnostics have been logged.
              </p>
            </div>
            {this.state.error && (
              <div className="text-xs font-mono p-3 rounded-lg text-left overflow-auto max-h-32"
                style={{ background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.15)' }}>
                {this.state.error.toString()}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={this.handleReset} className="btn-primary flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4" /> Try Again
              </button>
              <button onClick={this.handleGoHome} className="btn-secondary flex items-center gap-1.5">
                <Home className="h-4 w-4" /> Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
