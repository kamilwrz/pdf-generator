import { usePageTitle } from '../../i18n/usePageTitle.js';
import { useMessageState, messageRef, messageOf } from '../../i18n/messageState.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import LanguageSelect from '../../components/common/LanguageSelect/LanguageSelect';
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
  usePageTitle("common:loginTitle");
  useTranslation();

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedStart = searchParams.get("start");
    const startIntent = ["import", "new", "wizard", "templates", "download"].includes(requestedStart)
        ? (requestedStart === "wizard" ? "new" : requestedStart)
        : null;

    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useMessageState("");
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useMessageState("");
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
        setStatusMessage(messageRef("auth:login.signingIn"));

        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => {
            setStatusMessage(messageRef("auth:login.startingTheServerTheFirstSignIn"));
        }, 5000);

        // Another wake in parallel with the login attempt itself.
        wakeBackend();

        try {
            await signIn(username, password, {
                onRetry: (attempt) => setStatusMessage(messageRef("auth:login.tryingAgainTheServerIsStarting", { value0: (attempt) })),
            });
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            clearPendingAuthIntent();
            navigate(postAuthPath(searchParams), { replace: true });
        } catch (err) {
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            setError(messageOf(err) || messageRef("auth:login.signInFailed"));
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
            setError(messageOf(err) || messageRef("auth:login.googleSignInFailed"));
            setGoogleLoading(false);
        }
    }

    async function handleResend() {
        if (isLoading) return;
        if (!unverifiedEmail) {
            setError(messageRef("auth:login.toResendTheLinkEnterTheEmail"));
            return;
        }
        setIsLoading(true);
        setError("");
        setStatusMessage(messageRef("auth:login.sendingANewLink"));
        try {
            const result = await resendVerification(unverifiedEmail);
            setStatusMessage(messageOf(result));
        } catch (err) {
            setError(messageOf(err) || messageRef("auth:login.couldNotSendANewLink"));
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
        ? uiText("auth:login.afterSigningInConfirmTheDraftIs")
        : startIntent === "import"
        ? uiText("auth:login.afterSigningInContinueToCvImport")
        : startIntent === "new"
            ? uiText("auth:login.afterSigningInContinueToNewCv")
            : startIntent === "templates"
                ? uiText("auth:login.afterSigningInContinueToTemplateSelection")
                : uiText("auth:login.openASavedCvAndReturnTo");

    return (
        <div className={classes.container}>


            <section className={classes.authColumn} aria-labelledby="login-title">
                <div className={classes.loginCard}>
                    <LanguageSelect />
                    <Link to="/" className={classes.logoBadge} aria-label={uiText("public:siteLayout.cvStudioHomepage")}>
                        <img src="/cv-studio-logo.svg" alt="" />
                    </Link>
                    <p className={classes.cardEyebrow}>{uiText("auth:login.yourAccount")}</p>
                    <h1 id="login-title" className={classes.mainHeading}>{uiText("auth:login.signInToCvStudio")}</h1>
                    <p className={classes.subHeading}>{startIntent === "download" ? selectedStartLabel : uiText("auth:login.openYourSavedDocumentsAndContinueWorking")}</p>
                    {searchParams.get("verified") === "1" && <p className={classes.status} role="status">{uiText("auth:login.yourEmailAddressHasBeenVerifiedYou")}</p>}
                    {searchParams.get("registered") === "1" && <p className={classes.status} role="status">{uiText("auth:login.yourAccountIsReadySignInTo")}</p>}
                    <div className={classes.googleSlot}><GoogleSignInButton onCredential={handleGoogleCredential} disabled={googleLoading || isLoading} /></div>
                    <div className={classes.authDivider}><span>{uiText("auth:login.orUseAPassword")}</span></div>
                    <form onSubmit={handleSubmit} className={classes.form} aria-describedby={error ? "login-error" : undefined}>
                        <div className={classes.control}>
                            <label htmlFor="username">{uiText("auth:login.username")}</label>
                            <div className={`${classes.field} ${error ? classes.fieldError : ""}`}>
                                <UserIcon />
                                <input
                                    id="username"
                                    type="text"
                                    name="username"
                                    value={username}
                                    onChange={handleChangeUsername}
                                    placeholder={uiText("auth:login.enterYourUsername")}
                                    autoComplete="username"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                        <div className={classes.control}>
                            <label htmlFor="password">{uiText("auth:login.password")}</label>
                            <div className={`${classes.field} ${error ? classes.fieldError : ""}`}>
                                <LockIcon />
                                <input
                                    id="password"
                                    type="password"
                                    name="password"
                                    value={password}
                                    onChange={handleChangePassword}
                                    placeholder={uiText("auth:login.enterYourPassword")}
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
                        {error && unverifiedEmail ? <button type="button" className={classes.authBtnSecondary} onClick={handleResend} disabled={isLoading}>{isLoading ? uiText("auth:login.sending") : uiText("auth:login.resendLink")}</button> : null}
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
                            {isLoading ? uiText("auth:login.signingIn") : uiText("public:siteLayout.signIn")}
                        </button>
                    </form>
                    <p className={classes.linkWrapper}>{uiText("auth:login.noAccountYet")} <Link to={authLink('/register', searchParams)}>{uiText("auth:login.createAccount")}</Link>
                    </p>
                </div>
            </section>
            <aside className={classes.storyPanel}>
                <Link className={classes.backLink} to="/">
                    <span aria-hidden="true">←</span>
                    CV STUDIO
                </Link>
                <div className={classes.storyCopy}>
                    <p className={classes.storyEyebrow}>{uiText("auth:login.afterSigningIn")}</p>
                    <h2>{uiText("auth:login.returnToYourSavedCvs")}</h2>
                    <p>{uiText("auth:login.openADocumentMakeYourChangesAnd")}</p>
                </div>
                <div className={classes.storyPath}>
                    <span>{uiText("auth:login.continueYourWork")}</span>
                    <b>{selectedStartLabel}</b>
                    <div><i /> {uiText("auth:login.documentChangesPdf")}</div>
                </div>
            </aside>
        </div>
    )
}
