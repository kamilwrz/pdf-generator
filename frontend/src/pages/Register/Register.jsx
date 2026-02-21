import classes from "./Register.module.css";

import { ApiClient } from "../../services/api";
import { ENDPOINTS } from "../../services/api";

import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";

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
                <div className={classes.logoWrapper}>
                    <img src="/images/logo1-no_text.png" alt="Logo" />
                </div>
                <h1 className={classes.mainHeading}>Create account</h1>
                <form onSubmit={handleSubmit} className={classes.form}>
                    <div className={classes.control}>
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            name="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={error ? classes.inputAuthError : classes.input}
                            placeholder="Enter your username"
                            autoComplete="username"
                            disabled={isLoading}
                            required
                        />
                    </div>
                    <div className={classes.control}>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            name="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={error ? classes.inputAuthError : classes.input}
                            placeholder="Enter your email"
                            autoComplete="email"
                            disabled={isLoading}
                            required
                        />
                    </div>
                    <div className={classes.control}>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={error ? classes.inputAuthError : classes.input}
                            placeholder="Enter your password"
                            autoComplete="new-password"
                            disabled={isLoading}
                            required
                        />
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
                        {isLoading ? "Creating account…" : "Sign up"}
                    </button>
                </form>
                <p className={classes.linkWrapper}>
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
