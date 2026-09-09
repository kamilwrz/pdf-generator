/**
 * Login form. Does not gate on /health — cold starts use a long token timeout
 * plus retries; wakeBackend runs in the background to warm the dyno.
 */
import classes from "../../components/common/AuthLayout/AuthLayout.module.css";

import { wakeBackend } from "../../services/api";
import { authLink, clearPendingAuthIntent, postAuthPath } from "../../utils/siteRoutes";
import { signIn } from "../../services/signIn";
import GoogleSignInButton from "../../components/common/GoogleSignInButton/GoogleSignInButton";
import { resendVerification, signInWithGoogle } from "../../services/authApi";

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
    const startIntent = ["import", "new", "wizard", "templates", "download"].includes(requestedStart)
        ? (requestedStart === "wizard" ? "new" : requestedStart)
        : null;

    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [unverifiedEmail, setUnverifiedEmail] = useState("");
    const [googleLoading, setGoogleLoading] = useState(false);
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
            await signIn(username, password, {
                onRetry: (attempt) => setStatusMessage(`Ponawianie logowania (${attempt}/4)… serwer właśnie wstaje.`),
            });
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            clearPendingAuthIntent();
            navigate(postAuthPath(searchParams), { replace: true });
        } catch (err) {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            setError(err.message || "Logowanie nie powiodło się");
            if (err.code === "email_unverified") setUnverifiedEmail(err.detail?.email || "");
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
        if (isLoading) return;
        if (!unverifiedEmail) {
            setError("Aby ponowić wysyłkę, wpisz adres e-mail użyty przy rejestracji.");
            return;
        }
        setIsLoading(true);
        setError("");
        setStatusMessage("Wysyłanie nowego linku…");
        try {
            const result = await resendVerification(unverifiedEmail);
            setStatusMessage(result.message);
        } catch (err) {
            setError(err.message || "Nie udało się wysłać nowego linku.");
        } finally {
            setIsLoading(false);
        }
    }

    function handleChangeUsername(e) {
        setUsername(e.target.value)
    }

    function handleChangePassword(e) {
        setPassword(e.target.value)
    }

    const selectedStartLabel = startIntent === "download"
        ? "Po zalogowaniu potwierdzisz swój szkic i pobierzesz PDF."
        : startIntent === "import"
        ? "Po zalogowaniu otworzymy import Twojego CV."
        : startIntent === "new"
            ? "Po zalogowaniu otworzymy konfigurator nowego CV na A4."
            : startIntent === "templates"
                ? "Po zalogowaniu otworzymy wybór szablonów."
                : "Wróć do swoich dokumentów i kontynuuj od miejsca, w którym skończyłeś.";

    return (
        <div className={classes.container}>


            <section className={classes.authColumn} aria-labelledby="login-title">
                <div className={classes.loginCard}>
                    <Link to="/" className={classes.logoBadge} aria-label="CV Studio — strona główna">
                        <img src="/cv-studio-logo.svg" alt="" />
                    </Link>
                    <p className={classes.cardEyebrow}>Dostęp do Twoich dokumentów</p>
                    <h1 id="login-title" className={classes.mainHeading}>Witaj ponownie</h1>
                    <p className={classes.subHeading}>{startIntent === "download" ? selectedStartLabel : "Zaloguj się, aby kontynuować projektowanie."}</p>
                    {searchParams.get("verified") === "1" && <p className={classes.status} role="status">Adres e-mail został potwierdzony. Możesz się zalogować.</p>}
                    {searchParams.get("registered") === "1" && <p className={classes.status} role="status">Konto zostało utworzone. Automatyczne logowanie nie powiodło się — zaloguj się, aby kontynuować.</p>}
                    <div className={classes.googleSlot}><GoogleSignInButton onCredential={handleGoogleCredential} disabled={googleLoading || isLoading} /></div>
                    <div className={classes.authDivider}><span>lub użyj hasła</span></div>
                    <form onSubmit={handleSubmit} className={classes.form} aria-describedby={error ? "login-error" : undefined}>
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
                            <p id="login-error" className={classes.error} role="alert">
                                {error}
                            </p>
                        )}
                        {error && unverifiedEmail ? <button type="button" className={classes.authBtnSecondary} onClick={handleResend} disabled={isLoading}>{isLoading ? "Wysyłanie…" : "Wyślij link ponownie"}</button> : null}
                        {statusMessage && !error && (
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
                        Nowy użytkownik? <Link to={authLink('/register', searchParams)}>Utwórz konto</Link>
                    </p>
                </div>
            </section>
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
        </div>
    )
}
