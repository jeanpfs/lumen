import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" style={{ padding: "24px", textAlign: "center" }}>
          <Icon name="alert" size="lg" />
          <h1 className="t-20 strong">Something went wrong</h1>
          {this.state.error && (
            <p className="muted t-12" style={{ marginTop: "8px", wordBreak: "break-word" }}>
              {this.state.error.message}
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
            style={{ marginTop: "16px" }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
