import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
  }

  // D-FIX：当父组件传入的 children 发生变化（例如新的游戏状态到达导致重新渲染），
  // 自动重置错误状态，让组件有机会重新尝试渲染而无需手动刷新页面。
  public override componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <main className="app error-screen" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
          <div style={{ background: '#fff9ef', border: '3px solid #312d28', borderRadius: '24px', padding: '32px 24px', maxWidth: '440px', boxShadow: '6px 8px 0 #312d28' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎲</div>
            <h1 style={{ margin: '0 0 10px', fontSize: '1.4rem', fontWeight: 900, color: '#312d28' }}>
              界面渲染遇到异常
            </h1>
            <p style={{ margin: '0 0 20px', color: '#6f665d', fontSize: '0.88rem', lineHeight: 1.6 }}>
              对局数据已由服务器安全保留。点击下方按钮即可重新加载并恢复战局。
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                padding: '0 24px',
                border: '2px solid #312d28',
                borderRadius: '14px',
                background: '#ef4d39',
                color: '#fff',
                fontWeight: 900,
                fontSize: '0.95rem',
                boxShadow: '2px 3px 0 #312d28',
                cursor: 'pointer',
              }}
            >
              刷新并恢复对局
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
