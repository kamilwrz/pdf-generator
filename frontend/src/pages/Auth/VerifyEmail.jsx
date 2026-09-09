/** Consume the one-time verification link and guide the user back to login. */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import classes from "../../components/common/AuthLayout/AuthLayout.module.css";
import { verifyEmail } from "../../services/authApi";
import { authLink, getPendingAuthIntent } from "../../utils/siteRoutes";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "Potwierdzamy adres e-mail…" : "W linku brakuje kodu potwierdzającego.");
  const intentParams = getPendingAuthIntent();
  const loginBase = authLink("/login", intentParams);
  const verifiedLogin = `${loginBase}${loginBase.includes("?") ? "&" : "?"}verified=1`;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then((result) => {
        if (!cancelled) {
          setState("success");
          setMessage(result.message || "Adres e-mail został potwierdzony.");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState("error");
          setMessage(error.message || "Link jest nieprawidłowy lub wygasł.");
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className={classes.container}>
      <section className={classes.authColumn} aria-labelledby="verify-title">
        <div className={classes.loginCard}>
          <Link to="/" className={classes.logoBadge} aria-label="CV Studio — strona główna"><img src="/cv-studio-logo.svg" alt="" /></Link>
          <p className={classes.cardEyebrow}>Bezpieczne konto</p>
          <h1 id="verify-title" className={classes.mainHeading}>{state === "success" ? "E-mail potwierdzony" : state === "loading" ? "Sprawdzamy link" : "Nie udało się potwierdzić"}</h1>
          <p className={state === "error" ? classes.error : classes.status} role={state === "error" ? "alert" : "status"}>{message}</p>
          {state === "success" ? <Link className={classes.authLinkButton} to={verifiedLogin}>Przejdź do logowania</Link> : null}
          {state === "error" ? <Link className={classes.authLinkButton} to={loginBase}>Wróć do logowania</Link> : null}
        </div>
      </section>
      <aside className={classes.storyPanel} aria-label="Co dalej">
        <div className={classes.storyCopy}><p className={classes.storyEyebrow}>01 / 02</p><h2>Potwierdzenie chroni Twoje dokumenty.</h2><p>Po weryfikacji zalogujesz się i wrócisz do szkicu zapisanego w tej przeglądarce.</p></div>
      </aside>
    </main>
  );
}
