import classes from "./Register.module.css";

import { ApiClient } from "../../services/api";
import { ENDPOINTS } from "../../services/api";

import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";

const UserIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B7A892" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>
);
const MailIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B7A892" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
const LockIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B7A892" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
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

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    function handleSubmit(e) {
        e.preventDefault();
        setError("");

        const api = new ApiClient();
        api.httpRequest(ENDPOINTS.AUTH.REGISTER, "POST", JSON.stringify({ username, email, password }), "Registration failed")
            .then(() => {
                setIsLoading(true);
                setTimeout(() => {
                    navigate("/login");
                    setIsLoading(false);
                }, 1500);
            })
            .catch((err) => {
                setError(err.message);
                setIsLoading(false);
            });
    }

    return (
        <div className={classes.container}>
            <div className={classes.loginCard}>
                <div className={classes.logoBadge}>
                    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                </div>
                <h1 className={classes.mainHeading}>Create your account</h1>
                <p className={classes.subHeading}>Free forever. No card needed.</p>
                <form onSubmit={handleSubmit} className={classes.form}>
                    <div className={classes.control}>
                        <label htmlFor="username">Username</label>
                        <div className={`${classes.field} ${error ? classes.fieldError : ""}`}>
                            <UserIcon />
                            <input
                                id="username"
                                type="text"
                                name="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter your username"
                                autoComplete="username"
                                disabled={isLoading}
                                required
                            />
                        </div>
                    </div>
                    <div className={classes.control}>
                        <label htmlFor="email">Email</label>
                        <div className={`${classes.field} ${error ? classes.fieldError : ""}`}>
                            <MailIcon />
                            <input
                                id="email"
                                type="email"
                                name="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                autoComplete="email"
                                disabled={isLoading}
                                required
                            />
                        </div>
                    </div>
                    <div className={classes.control}>
                        <label htmlFor="password">Password</label>
                        <div className={`${classes.field} ${error ? classes.fieldError : ""}`}>
                            <LockIcon />
                            <input
                                id="password"
                                type="password"
                                name="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
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
                    <button
                        type="submit"
                        className={classes.authBtn}
                        disabled={isLoading}
                    >
                        {isLoading ? "Creating account…" : "Create account"}
                    </button>
                </form>
                <p className={classes.linkWrapper}>
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
