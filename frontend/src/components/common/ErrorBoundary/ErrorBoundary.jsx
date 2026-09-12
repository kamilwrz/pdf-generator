import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
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
        title={this.props.title}
        description={this.props.description}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

function FailurePanel({ compact = false, title, description, onRetry }) {
  useTranslation();
  return (
    <main className={`${classes.page}${compact ? ` ${classes.compact}` : ""}`}>
      <section className={classes.panel} role="alert" aria-live="assertive">
        <span className={classes.eyebrow}>{uiText("errors:errorBoundary.cvStudioError")}</span>
        <h1>{title || uiText("errors:errorBoundary.couldNotDisplayTheEditor")}</h1>
        <p>{description || uiText("errors:errorBoundary.yourDataRemainsInThisTabTry")}</p>
        <div className={classes.actions}>
          {onRetry ? (
            <button type="button" onClick={onRetry}>{uiText("errors:errorBoundary.tryAgain")}</button>
          ) : null}
          <Link to="/">{uiText("errors:errorBoundary.goToHomepage")}</Link>
        </div>
      </section>
    </main>
  );
}

/** Branded fallback used by React Router for loader/render failures. */
export function RouteErrorPage() {
  useTranslation();
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <FailurePanel
      title={notFound ? uiText("errors:errorBoundary.pageNotFound") : uiText("errors:errorBoundary.couldNotOpenThisView")}
      description={notFound
        ? uiText("errors:errorBoundary.checkTheAddressOrReturnToThe")
        : uiText("errors:errorBoundary.refreshTheViewOrReturnToThe")}
      onRetry={() => window.location.reload()}
    />
  );
}

export function NotFoundPage() {
  useTranslation();
  return (
    <FailurePanel
      title={uiText("errors:errorBoundary.pageNotFound")}
      description={uiText("errors:errorBoundary.checkTheAddressOrReturnToThe")}
    />
  );
}
