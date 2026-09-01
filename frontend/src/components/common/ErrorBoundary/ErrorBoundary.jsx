import { Component } from "react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import classes from "./ErrorBoundary.module.css";

/**
 * Keeps recoverable editor failures inside the application shell.
 *
 * The boundary intentionally does not expose exception text: production
 * errors can contain request details or user content. `resetKey` lets the
 * editor recover automatically after a complete document-session change.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Editor render failed", {
      name: error?.name || "Error",
      componentStack: errorInfo?.componentStack || "",
    });
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <FailurePanel
        compact={this.props.compact}
        title={this.props.title || "Nie udało się wyświetlić edytora"}
        description={this.props.description || "Twoje dane pozostały w tej karcie. Spróbuj ponownie wyrenderować widok."}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

function FailurePanel({ compact = false, title, description, onRetry }) {
  return (
    <main className={`${classes.page}${compact ? ` ${classes.compact}` : ""}`}>
      <section className={classes.panel} role="alert" aria-live="assertive">
        <span className={classes.eyebrow}>CV STUDIO / BŁĄD</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className={classes.actions}>
          {onRetry ? (
            <button type="button" onClick={onRetry}>Spróbuj ponownie</button>
          ) : null}
          <Link to="/">Przejdź na stronę główną</Link>
        </div>
      </section>
    </main>
  );
}

/** Branded fallback used by React Router for loader/render failures. */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <FailurePanel
      title={notFound ? "Nie znaleziono tej strony" : "Nie udało się otworzyć widoku"}
      description={notFound
        ? "Sprawdź adres albo wróć do strony głównej."
        : "Odśwież widok lub wróć do strony głównej. Twoje dane nie są wyświetlane w komunikacie błędu."}
      onRetry={() => window.location.reload()}
    />
  );
}

export function NotFoundPage() {
  return (
    <FailurePanel
      title="Nie znaleziono tej strony"
      description="Sprawdź adres albo wróć do strony głównej."
    />
  );
}
