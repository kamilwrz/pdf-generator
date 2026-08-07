/**
 * Registration with optional plan selection (pre-Stripe unpaid paid plans).
 * Wakes the backend in the background like Login to survive Render cold start.
 */
import classes from "./Register.module.css";
import planClasses from "./PlanSelector.module.css";

import { ApiClient, ENDPOINTS, wakeBackend } from "../../services/api";

import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import PlanSelector, { PLAN_SLUGS } from "./PlanSelector";
import { queueGuestEvent } from "../../utils/guestEvents";

const UserIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#97A1B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>
);
const MailIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#97A1B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
const LockIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#97A1B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
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

    const [searchParams] = useSearchParams();
    const initialPlan = PLAN_SLUGS.includes(searchParams.get("plan"))
        ? searchParams.get("plan")
        : "free";
    const startIntent = ["import", "wizard", "templates", "blank"].includes(searchParams.get("start"))
        ? searchParams.get("start")
        : null;
    const [plan, setPlan] = useState(initialPlan);

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const hintTimerRef = useRef(null);

    useEffect(() => {
        wakeBackend();
        return () => {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        };
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (isLoading) return;
        setError("");
        setIsLoading(true);
        setStatusMessage("Tworzenie konta…");

        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => {
            setStatusMessage("Budzenie serwera… pierwsze uruchomienie może potrwać do minuty.");
        }, 5000);

        wakeBackend();

        try {
            const api = new ApiClient();
            await api.httpRequest(
                ENDPOINTS.AUTH.REGISTER,
                "POST",
                JSON.stringify({ username, email, password, plan }),
                "Rejestracja nie powiodła się",
                {
                    timeoutMs: 90_000,
                    retries: 4,
                    retryDelayMs: 3_000,
                    onRetry: (attempt) => {
                        setStatusMessage(`Ponawianie rejestracji (${attempt}/4)… serwer właśnie wstaje.`);
                    },
                },
            );
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            queueGuestEvent("register_completed");
            // Preserve the landing-page choice through account creation so the
            // first authenticated screen opens the import panel or CV wizard.
            const loginPath = startIntent ? `/login?start=${startIntent}` : "/login";
            navigate(loginPath, { replace: true });
        } catch (err) {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            setError(err.message || "Rejestracja nie powiodła się");
            setStatusMessage("");
            setIsLoading(false);
        }
    }

    const startNotice = startIntent === "import"
        ? "Po utworzeniu konta otworzymy import PDF, aby przenieść Twoje dane do nowego szablonu."
        : startIntent === "wizard"
            ? "Po utworzeniu konta otworzymy kreator CV krok po kroku."
            : startIntent === "templates"
                ? "Po utworzeniu konta otworzymy wybór szablonów."
                : startIntent === "blank"
                    ? "Po utworzeniu konta otworzymy pusty projekt własny ze swobodną edycją."
                    : "Wybierz plan, utwórz konto i zacznij od szablonu, importu PDF albo projektu własnego.";

    return (
        <div className={classes.container}>
            <aside className={classes.storyPanel}>
                <Link className={classes.backLink} to="/">
                    <span aria-hidden="true">←</span>
                    CV STUDIO
                </Link>
                <div className={classes.storyCopy}>
                    <p className={classes.storyEyebrow}>Jedno CV, dwa sposoby startu</p>
                    <h2>Nie musisz zaczynać od pustej kartki.</h2>
                    <p>Wgraj dotychczasowe CV albo ułóż pierwszą wersję w kreatorze. Później wybierzesz szablon i dopracujesz każdy szczegół.</p>
                </div>
                <ol className={classes.storySteps}>
                    <li><span>01</span><b>Wybierz start</b><p>Import PDF albo kreator.</p></li>
                    <li><span>02</span><b>Wybierz wygląd</b><p>Porównaj szablony na własnych danych.</p></li>
                    <li><span>03</span><b>Dopracuj i pobierz</b><p>Edytuj na A4, potem eksportuj PDF.</p></li>
                </ol>
            </aside>

            <section className={classes.authColumn} aria-labelledby="register-title">
                <div className={classes.loginCard}>
                    <div className={classes.logoBadge}>
                        <img src="/cv-studio-logo.svg" alt="CV Studio" />
                    </div>
                    <p className={classes.cardEyebrow}>Pierwsza wersja CV</p>
                    <h1 id="register-title" className={classes.mainHeading}>Utwórz konto</h1>
                    <p className={classes.subHeading}>Zacznij bez karty. Plan możesz zmienić później.</p>
                    <p className={classes.intentNotice}>{startNotice}</p>
                    <div className={classes.control}>
                        <label>Plan</label>
                        <PlanSelector value={plan} onChange={setPlan} classes={planClasses} disabled={isLoading} />
                    </div>
                    <form onSubmit={handleSubmit} className={classes.form}>
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
                            <p className={classes.error} role="alert">
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
                            {isLoading ? "Tworzenie konta…" : "Utwórz konto"}
                        </button>
                    </form>
                    <p className={classes.linkWrapper}>
                        Masz już konto? <Link to={startIntent ? `/login?start=${startIntent}` : "/login"}>Zaloguj się</Link>
                    </p>
                </div>
            </section>
        </div>
    );
}
