import classes from "./Login.module.css";

import { ApiClient } from "../../services/api";
import { ENDPOINTS } from "../../services/api";

import { useNavigate } from "react-router-dom"
import { useState } from "react";


export default function Login() {

    const navigate = useNavigate();

    const [password, setPassword] = useState();
    const [username, setUsername] = useState();
    const [error, setError] = useState();
    const [isLoading, setIsLoading] = useState();

    function handleSubmit(e) {
        e.preventDefault();

        const formDetails = new URLSearchParams();
        formDetails.append("username", username);
        formDetails.append("password", password);

        const api = new ApiClient({ "Content-Type": "application/x-www-form-urlencoded" });
        api.httpRequest(ENDPOINTS.AUTH.LOGIN, "POST", formDetails, "Login failed").
        then((data) => {
            setIsLoading(true);
            localStorage.setItem("token", data.access_token);
            setTimeout(() => {
                navigate("/pdfcanvas");
                setIsLoading(false);
            }, 2000)
        }).
        catch((error) => {
            setError(error.message);
            setIsLoading(false);
        })
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
                <div className={classes.logoWrapper}>
                    <img src="/images/logo.png" alt="Logo" />
                </div>
                <h1 className={classes.mainHeading}>Sign in</h1>
                <form onSubmit={handleSubmit} className={classes.form}>
                    <div className={classes.control}>
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            name="username"
                            value={username ?? ""}
                            onChange={handleChangeUsername}
                            className={error ? classes.inputAuthError : classes.input}
                            placeholder="Enter your username"
                            autoComplete="username"
                            disabled={isLoading}
                        />
                    </div>
                    <div className={classes.control}>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            name="password"
                            value={password ?? ""}
                            onChange={handleChangePassword}
                            className={error ? classes.inputAuthError : classes.input}
                            placeholder="Enter your password"
                            autoComplete="current-password"
                            disabled={isLoading}
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
                        {isLoading ? "Signing in…" : "Sign in"}
                    </button>
                </form>
            </div>
        </div>
    )
}