/**
 * Registration form. Every new account requests Free unless a supported plan
 * is explicitly present in the URL; the backend validates the final choice.
 * Wakes the backend in the background like Login to survive Render cold start.
 */
import classes from "../../components/common/AuthLayout/AuthLayout.module.css";

import { ApiClient, ENDPOINTS, wakeBackend } from "../../services/api";

import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { authLink, clearPendingAuthIntent, postAuthPath, savePendingAuthIntent } from "../../utils/siteRoutes";
import { PLAN_PRESENTATION } from "../../utils/planPresentation";
import GoogleSignInButton from "../../components/common/GoogleSignInButton/GoogleSignInButton";
import { resendVerification, signInWithGoogle } from "../../services/authApi";

const REGISTER_PLANS = [PLAN_PRESENTATION.free, PLAN_PRESENTATION.pro];

// Field icons inherit `currentColor` from `.field`, so they follow the same
// muted -> ink transition the input border does on focus (see Register.module.css).
const UserIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>
);
const MailIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
const LockIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

function strength(password) {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score; // 0..4
}

export default function Register() {

    const navigate = useNavigate();

    const [searchParams, setSearchParams] = useSearchParams();
    const requestedStart = searchParams.get("start");
    const startIntent = ["import", "new", "wizard", "templates", "download"].includes(requestedStart)
        ? (requestedStart === "wizard" ? "new" : requestedStart)
        : null;
    // Landing CTAs may pass ?plan=pro (legacy standard/premium remap on backend).
    const downloading = startIntent === "download";
    const requestedPlan = !downloading && ["free", "pro", "standard", "premium"].includes(searchParams.get("plan"))
        ? searchParams.get("plan")
        : "free";
    const selectedPlanSlug = requestedPlan === "standard" || requestedPlan === "premium"
        ? "pro"
        : requestedPlan;
    const selectedPlan = PLAN_PRESENTATION[selectedPlanSlug];

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [verificationPending, setVerificationPending] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const hintTimerRef = useRef(null);

    useEffect(() => {
        wakeBackend();
        return () => {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        };
    }, []);

    /**
     * Keeps the plan comparison, registration copy, URL, and submitted account
     * tier synchronized. Existing start intent parameters remain untouched.
     */
    function selectPlan(planSlug, focusTab = false) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("plan", planSlug);
        setSearchParams(nextParams, { replace: true });

        if (focusTab) {
            requestAnimationFrame(() => {
                document.getElementById(`register-plan-tab-${planSlug}`)?.focus();
            });
        }
    }

    /** Implements the WAI-ARIA horizontal-tabs keyboard interaction. */
    function handlePlanTabKeyDown(event) {
        const currentIndex = REGISTER_PLANS.findIndex((plan) => plan.slug === selectedPlanSlug);
        let nextIndex = currentIndex;

        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % REGISTER_PLANS.length;
        else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + REGISTER_PLANS.length) % REGISTER_PLANS.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = REGISTER_PLANS.length - 1;
        else return;

        event.preventDefault();
        selectPlan(REGISTER_PLANS[nextIndex].slug, true);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (isLoading) return;
        setError("");
        setIsLoading(true);
        setStatusMessage("Tworzymy konto…");

        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => {
            setStatusMessage("Uruchamiamy serwer. Pierwsza rejestracja po przerwie może potrwać do minuty.");
        }, 5000);

        // Persist the validated start intent before the network request so the
        // verification link can resume it even when it opens in another tab.
        savePendingAuthIntent(searchParams);
        wakeBackend();

        try {
            const api = new ApiClient();
            const result = await api.httpRequest(
                ENDPOINTS.AUTH.REGISTER,
                "POST",
                JSON.stringify({ username: username.trim(), email, password, plan: selectedPlanSlug }),
                "Rejestracja nie powiodła się",
                {
                    timeoutMs: 90_000,
                    retries: 4,
                    retryDelayMs: 3_000,
                    onRetry: (attempt) => {
                        setStatusMessage(`Próbujemy ponownie (${attempt}/4). Serwer właśnie się uruchamia.`);
                    },
                },
            );
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            setPassword("");
            setVerificationPending(true);
            setStatusMessage(result.message || "Sprawdź skrzynkę i potwierdź adres e-mail.");
            setIsLoading(false);
        } catch (err) {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            setError(err.message || "Rejestracja nie powiodła się");
            setStatusMessage("");
            setIsLoading(false);
        }
    }

    async function handleGoogleCredential(credential) {
        if (!credential || googleLoading) return;
        setGoogleLoading(true);
        setError("");
        try {
            await signInWithGoogle(credential);
            clearPendingAuthIntent();
            navigate(postAuthPath(searchParams), { replace: true });
        } catch (err) {
            setError(err.message || "Logowanie Google nie powiodło się.");
            setGoogleLoading(false);
        }
    }

    async function handleResend() {
        if (!email || isLoading) return;
        setIsLoading(true);
        setError("");
        try {
            const result = await resendVerification(email);
            setStatusMessage(result.message);
        } catch (err) {
            setError(err.message || "Nie udało się wysłać nowego linku.");
        } finally {
            setIsLoading(false);
        }
    }

    const startNotice = downloading
        ? "Załóż konto i potwierdź e-mail. Po zalogowaniu wrócisz do szkicu i pobierzesz PDF."
        : startIntent === "import"
        ? "Po rejestracji przejdziesz do importu PDF. Plan Darmowy obejmuje jeden udany import PDF w miesiącu."
        : startIntent === "new"
            ? "Po rejestracji wrócisz do konfiguracji nowego CV."
            : startIntent === "templates"
                ? "Po rejestracji przejdziesz do wyboru szablonu."
            : selectedPlanSlug === "pro"
                        ? "Załóż konto, a potem wybierz Pro. Otrzymasz wszystkie szablony, więcej projektów i narzędzia AI."
                        : "Darmowe konto wystarczy, żeby zacząć od szablonu lub przenieść treść z obecnego CV.";

    return (
        <div className={classes.container}>


            <section className={classes.authColumn} aria-labelledby="register-title">
                <div className={classes.loginCard}>
                    <Link to="/" className={classes.logoBadge} aria-label="CV Studio — strona główna">
                        <img src="/cv-studio-logo.svg" alt="" />
                    </Link>
                    <p className={classes.cardEyebrow}>Załóż konto</p>
                    <h1 id="register-title" className={classes.mainHeading}>{downloading ? "Utwórz darmowe konto" : "Utwórz konto"}</h1>
                    <p className={classes.subHeading}>
                        {selectedPlanSlug === "pro"
                            ? "Pro kosztuje 59 zł za 30 dni. Płacisz raz przez Stripe, bez automatycznego odnowienia."
                            : "Plan Darmowy obejmuje 1 CV, 3 szablony i 3 pliki PDF miesięcznie. Nie potrzebujesz karty."}
                    </p>
                    <p className={classes.intentNotice}>{startNotice}</p>
                    {verificationPending ? (
                        <div className={classes.verificationActions}>
                            <p className={classes.status} role="status" aria-live="polite">{statusMessage}</p>
                            {error ? <p className={classes.error} role="alert">{error}</p> : null}
                            <button type="button" className={classes.authBtnSecondary} onClick={handleResend} disabled={isLoading}>{isLoading ? "Wysyłanie…" : "Wyślij link ponownie"}</button>
                            <Link className={classes.authLinkButton} to={authLink('/login', searchParams)}>Przejdź do logowania</Link>
                        </div>
                    ) : <>
                    <div className={classes.googleSlot}><GoogleSignInButton onCredential={handleGoogleCredential} disabled={googleLoading || isLoading} label="signup_with" /></div>
                    <div className={classes.authDivider}><span>lub użyj e-maila</span></div>
                    <form onSubmit={handleSubmit} className={classes.form} aria-describedby={error ? "register-error" : undefined}>
                        <div className={classes.control}>
                            <label htmlFor="username">Nazwa użytkownika</label>
                            <div className={`${classes.field} ${error ? classes.fieldError : ""}`}>
                                <UserIcon />
                                <input
                                    id="username"
                                    type="text"
                                    name="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Wpisz nazwę użytkownika"
                                    autoComplete="username"
                                    disabled={isLoading}
                                    required
                                />
                            </div>
                        </div>
                        <div className={classes.control}>
                            <label htmlFor="email">E-mail</label>
                            <div className={`${classes.field} ${error ? classes.fieldError : ""}`}>
                                <MailIcon />
                                <input
                                    id="email"
                                    type="email"
                                    name="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Wpisz adres e-mail"
                                    autoComplete="email"
                                    disabled={isLoading}
                                    required
                                />
                            </div>
                        </div>
                        <div className={classes.control}>
                            <label htmlFor="password">Hasło</label>
                            <div className={`${classes.field} ${error ? classes.fieldError : ""}`}>
                                <LockIcon />
                                <input
                                    id="password"
                                    type="password"
                                    name="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Wpisz hasło"
                                    autoComplete="new-password"
                                    disabled={isLoading}
                                    required
                                />
                            </div>
                            <div className={classes.strength} aria-hidden="true">
                                {[0, 1, 2, 3].map((i) => (
                                    <span
                                        key={i}
                                        className={i < strength(password) ? classes.strengthOn : ""}
                                        data-level={strength(password)}
                                    />
                                ))}
                            </div>
                        </div>
                        {error && (
                            <p id="register-error" className={classes.error} role="alert">
                                {error}
                            </p>
                        )}
                        {isLoading && statusMessage && !error && (
                            <p className={classes.status} role="status" aria-live="polite">
                                {statusMessage}
                            </p>
                        )}
                        <button
                            type="submit"
                            className={classes.authBtn}
                            disabled={isLoading}
                        >
                            {isLoading ? "Tworzymy konto…" : downloading ? "Utwórz konto i przejdź do PDF" : "Utwórz konto"}
                        </button>
                    </form>
                    </>}
                    <p className={classes.linkWrapper}>
                        Masz już konto? <Link to={authLink('/login', searchParams)}>Zaloguj się</Link>
                    </p>
                </div>
            </section>
            <aside className={classes.storyPanel}>
                <Link className={classes.backLink} to="/">
                    <span aria-hidden="true">←</span>
                    CV STUDIO
                </Link>
                {downloading ? <div className={classes.planComparison}>
                    <p className={classes.storyEyebrow}>Twoje pierwsze CV</p>
                    <h2>CV jest gotowe do pobrania.</h2>
                    <p className={classes.planPeriod}>Darmowe konto, bez karty</p>
                    <ol className={classes.planFeatures} aria-label="Droga do pobrania CV">
                        <li><span aria-hidden="true">01</span><p>CV przygotowane w edytorze</p></li>
                        <li aria-current="step"><span aria-hidden="true">02</span><p>Utwórz darmowe konto</p></li>
                        <li><span aria-hidden="true">03</span><p>Potwierdź swój szkic i pobierz PDF</p></li>
                    </ol>
                </div> : <div className={classes.planComparison}>
                    <p className={classes.storyEyebrow}>Porównaj plany</p>
                    <h2>Jak chcesz pracować nad CV?</h2>

                    <div className={classes.planTabs} role="tablist" aria-label="Wybierz plan konta">
                        {REGISTER_PLANS.map((plan) => {
                            const isSelected = selectedPlanSlug === plan.slug;
                            return (
                                <button
                                    key={plan.slug}
                                    id={`register-plan-tab-${plan.slug}`}
                                    type="button"
                                    role="tab"
                                    aria-selected={isSelected}
                                    aria-controls="register-plan-panel"
                                    tabIndex={isSelected ? 0 : -1}
                                    className={`${classes.planTab} ${isSelected ? classes.planTabActive : ""}`}
                                    onClick={() => selectPlan(plan.slug)}
                                    onKeyDown={handlePlanTabKeyDown}
                                >
                                    <span>{plan.name}</span>
                                    <strong>{plan.price_label}</strong>
                                </button>
                            );
                        })}
                    </div>

                    <section
                        id="register-plan-panel"
                        className={classes.planDetails}
                        role="tabpanel"
                        aria-labelledby={`register-plan-tab-${selectedPlanSlug}`}
                    >
                        <div className={classes.planLead}>
                            <p>{selectedPlan.blurb}</p>
                            {selectedPlan.badge && <span>{selectedPlan.badge}</span>}
                        </div>
                        <ol className={classes.planFeatures}>
                            {selectedPlan.highlights.map((feature, index) => (
                                <li key={feature}>
                                    <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                                    <p>{feature}</p>
                                </li>
                            ))}
                        </ol>
                        <p className={classes.planPeriod}>{selectedPlan.period_note}</p>
                    </section>
                </div>}
            </aside>
        </div>
    );
}
