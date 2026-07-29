import classes from "./Login.module.css";

import { ApiClient, ENDPOINTS, wakeBackend } from "../../services/api";

import { useNavigate, Link } from "react-router-dom"
import { useEffect, useRef, useState } from "react";

const UserIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#97A1B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>
);
const LockIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#97A1B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);


export default function Login() {

    const navigate = useNavigate();

    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const hintTimerRef = useRef(null);

    // Wake a sleeping Render free-tier dyno while the user types credentials.
    useEffect(() => {
        wakeBackend();
        return () => {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        };
    }, []);

    function handleSubmit(e) {
        e.preventDefault();
        if (isLoading) return;

        setError("");
        setIsLoading(true);
        setStatusMessage("Logowanie…");

        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => {
            setStatusMessage("Budzenie serwera… to może potrwać do minuty przy pierwszym uruchomieniu.");
        }, 6000);

        const formDetails = new URLSearchParams();
        formDetails.append("username", username.trim());
        formDetails.append("password", password);

        const api = new ApiClient({ "Content-Type": "application/x-www-form-urlencoded" });
        api.httpRequest(
            ENDPOINTS.AUTH.LOGIN,
            "POST",
            formDetails,
            "Logowanie nie powiodło się",
            { timeoutMs: 120_000 },
        )
            .then((data) => {
                if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
                localStorage.setItem("token", data.access_token);
                navigate("/pdfcanvas", { replace: true });
            })
            .catch((err) => {
                if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
                setError(err.message);
                setStatusMessage("");
                setIsLoading(false);
            });
    }

    function handleChangeUsername(e) {
        setUsername(e.target.value)
    }

    function handleChangePassword(e) {
        setPassword(e.target.value)
    }


    return (
        <div className={classes.container}>
            <div className={classes.loginCard}>
                <div className={classes.logoBadge}>
                    <img src="/kompoza-logo2.png" alt="CV STUDIO" />
                </div>
                <h1 className={classes.mainHeading}>Witaj ponownie</h1>
                <p className={classes.subHeading}>Zaloguj się, aby kontynuować projektowanie</p>
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
                    Nowy użytkownik? <Link to="/register">Utwórz konto</Link>
                </p>
            </div>
        </div>
    )
}
