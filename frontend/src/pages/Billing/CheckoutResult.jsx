/** Truthful Stripe return states; only the webhook can activate paid access. */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SiteLayout from "../../components/common/SiteLayout/SiteLayout";
import classes from "../../components/common/SiteLayout/SiteLayout.module.css";
import { ApiClient, ENDPOINTS } from "../../services/api";
import { getEditorPath } from "../../utils/authSession";

const POLL_DELAYS = [0, 1000, 1800, 3000, 5000];

export default function CheckoutResult({ variant }) {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id") || "";
  const [state, setState] = useState(
    variant === "cancel" ? "cancel" : sessionId ? "checking" : "error",
  );
  const api = useMemo(() => new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` }), []);

  useEffect(() => {
    if (variant !== "success" || !sessionId) return undefined;
    let cancelled = false;
    const timers = [];
    const check = async (index) => {
      try {
        const result = await api.httpRequest(ENDPOINTS.BILLING.CHECKOUT_SESSION(sessionId), "GET", null, "Nie udało się sprawdzić płatności.");
        if (cancelled) return;
        if (result.status === "succeeded") setState("success");
        else if (index + 1 < POLL_DELAYS.length) timers.push(setTimeout(() => check(index + 1), POLL_DELAYS[index + 1]));
        else setState("pending");
      } catch {
        if (!cancelled) setState("error");
      }
    };
    check(0);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [api, sessionId, variant]);

  const copy = {
    cancel: ["Płatność anulowana", "Nie pobrano opłaty. Możesz wrócić do konta i spróbować ponownie."],
    checking: ["Sprawdzamy płatność", "Stripe zakończył obsługę płatności. Czekamy na potwierdzenie z serwera."],
    success: ["Pro jest aktywne", "Płatność została potwierdzona. Możesz wrócić do dokumentu."],
    pending: ["Czekamy na potwierdzenie", "Potrzebujemy jeszcze chwili. Odśwież stronę lub sprawdź konto za moment."],
    error: ["Nie znamy jeszcze wyniku płatności", "Nie możemy teraz potwierdzić jej statusu. Sprawdź go na stronie konta."],
  }[state];

  return <SiteLayout title={copy[0]} intro={copy[1]}>
    <section className={state === "error" ? classes.error : classes.section} aria-live="polite">
      <p>{state === "checking" ? "Weryfikacja…" : copy[1]}</p>
      <div className={classes.actions}><Link className={classes.primary} to="/app/account">Przejdź do konta</Link><Link className={classes.secondary} to={getEditorPath()}>Wróć do CV</Link></div>
    </section>
  </SiteLayout>;
}
