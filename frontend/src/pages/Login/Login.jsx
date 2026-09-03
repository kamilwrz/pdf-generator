/**
 * Login form. Does not gate on /health — cold starts use a long token timeout
 * plus retries; wakeBackend runs in the background to warm the dyno.
 */
import classes from "./Login.module.css";

import { ApiClient, ENDPOINTS, wakeBackend } from "../../services/api";
import { getEditorPath, setSessionUsername } from "../../utils/authSession";

import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { useEffect, useRef, useState } from "react";

// Field icons inherit `currentColor` from `.field`, so they follow the same
// muted -> ink transition the input border does on focus (see Login.module.css).
const UserIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>
);
const LockIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);


export default function Login() {

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedStart = searchParams.get("start");
    const startIntent = ["import", "new", "wizard", "templates"].includes(requestedStart)
        ? (requestedStart === "wizard" ? "new" : requestedStart)
        : null;

    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const hintTimerRef = useRef(null);

    // Kick Render cold start while the user types — do not gate login on this.
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
        setStatusMessage("Logowanie…");

        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => {
            setStatusMessage("Budzenie serwera… pierwsze logowanie po przerwie może potrwać do minuty.");
        }, 5000);

        // Another wake in parallel with the login attempt itself.
        wakeBackend();

        try {
            const formDetails = new URLSearchParams();
            formDetails.append("username", username.trim());
            formDetails.append("password", password);

            const api = new ApiClient({ "Content-Type": "application/x-www-form-urlencoded" });
            const data = await api.httpRequest(
                ENDPOINTS.AUTH.LOGIN,
                "POST",
                formDetails,
                "Logowanie nie powiodło się",
                {
                    // One attempt can wait out a full Render cold start.
                    timeoutMs: 90_000,
                    retries: 4,
                    retryDelayMs: 3_000,
                    onRetry: (attempt) => {
                        setStatusMessage(`Ponawianie logowania (${attempt}/4)… serwer właśnie wstaje.`);
                    },
                },
            );
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            const sessionUsername = username.trim();
            localStorage.setItem("token", data.access_token);
            // Persist the handle used for `/cvstudio/{username}` so deep links
            // match the account without waiting for a JWT decode on remount.
            setSessionUsername(sessionUsername);
            navigate(getEditorPath({ start: startIntent }), { replace: true });
        } catch (err) {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            setError(err.message || "Logowanie nie powiodło się");
            setStatusMessage("");
            setIsLoading(false);
        }
    }

    function handleChangeUsername(e) {
        setUsername(e.target.value)
    }

    function handleChangePassword(e) {
        setPassword(e.target.value)
    }

    const selectedStartLabel = startIntent === "import"
        ? "Po zalogowaniu otworzymy import Twojego CV."
        : startIntent === "new"
            ? "Po zalogowaniu otworzymy konfigurator nowego CV na A4."
            : startIntent === "templates"
                ? "Po zalogowaniu otworzymy wybór szablonów."
                : "Wróć do swoich dokumentów i kontynuuj od miejsca, w którym skończyłeś.";

    return (
        <div className={classes.container}>
            <aside className={classes.storyPanel}>
                <Link className={classes.backLink} to="/">
                    <span aria-hidden="true">←</span>
                    CV STUDIO
                </Link>
                <div className={classes.storyCopy}>
                    <p className={classes.storyEyebrow}>Twoje CV. Twój następny krok.</p>
                    <h2>Wróć do dokumentu, który nadal jest Twój.</h2>
                    <p>Edytuj treść, sprawdzaj układ i pobieraj PDF dokładnie wtedy, gdy jest gotowy do wysłania.</p>
                </div>
                <div className={classes.storyPath}>
                    <span>Kontynuacja pracy</span>
                    <b>{selectedStartLabel}</b>
                    <div><i /> Dokument → poprawki → PDF</div>
                </div>
            </aside>

            <section className={classes.authColumn} aria-labelledby="login-title">
                <div className={classes.loginCard}>
                    <div className={classes.logoBadge}>
                        <img src="/cv-studio-logo.svg" alt="CV Studio" />
                    </div>
                    <p className={classes.cardEyebrow}>Dostęp do Twoich dokumentów</p>
                    <h1 id="login-title" className={classes.mainHeading}>Witaj ponownie</h1>
                    <p className={classes.subHeading}>Zaloguj się, aby kontynuować projektowanie.</p>
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
                                    onChange={handleChangeUsername}
                                    placeholder="Wpisz nazwę użytkownika"
                                    autoComplete="username"
                                    disabled={isLoading}
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
                                    onChange={handleChangePassword}
                                    placeholder="Wpisz hasło"
                                    autoComplete="current-password"
                                    disabled={isLoading}
                                />
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
                            {isLoading ? "Logowanie…" : "Zaloguj się"}
                        </button>
                    </form>
                    <p className={classes.linkWrapper}>
                        Nowy użytkownik? <Link to={startIntent ? `/register?start=${startIntent}` : "/register"}>Utwórz konto</Link>
                    </p>
                </div>
            </section>
        </div>
    )
}
