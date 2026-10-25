import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackText?: string;
  className?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class MathErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('MathErrorBoundary caught an error rendering math content:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <span 
          className={`math-error-fallback text-red-500 font-mono text-sm inline-block px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/30 ${this.props.className || ''}`}
          title="LaTeX rendering fallback"
        >
          {this.props.fallbackText || 'Formula Error'}
        </span>
      );
    }

    return this.props.children;
  }
}
