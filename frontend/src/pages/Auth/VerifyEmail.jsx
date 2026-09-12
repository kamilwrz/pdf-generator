import LanguageSelect from "../../components/common/LanguageSelect/LanguageSelect";
import { usePageTitle } from '../../i18n/usePageTitle.js';
import { useMessageState, messageRef, messageOf } from '../../i18n/messageState.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Consume the one-time verification link and guide the user back to login. */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import classes from "../../components/common/AuthLayout/AuthLayout.module.css";
import { verifyEmail } from "../../services/authApi";
import { authLink, getPendingAuthIntent } from "../../utils/siteRoutes";

export default function VerifyEmail() {
  usePageTitle("common:verificationTitle");
  useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState(token ? "loading" : "error");
  const [message, setMessage] = useMessageState(token ? messageRef("auth:verifyEmail.confirmingYourEmailAddress") : messageRef("auth:verifyEmail.theLinkIsMissingItsVerificationCode"));
  const intentParams = getPendingAuthIntent();
  const loginBase = authLink("/login", intentParams);
  const verifiedLogin = `${loginBase}${loginBase.includes("?") ? "&" : "?"}verified=1`;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then((result) => {
        if (!cancelled) {
          setState("success");
          setMessage(result?.message_key ? messageRef(`errors:server.${result.message_key}`, result.params) : messageRef("auth:verifyEmail.yourEmailAddressHasBeenVerified"));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState("error");
          setMessage(messageOf(error) || messageRef("auth:verifyEmail.theLinkIsInvalidOrHasExpired"));
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className={classes.container}>
      <section className={classes.authColumn} aria-labelledby="verify-title">
        <div className={classes.loginCard}>
          <LanguageSelect />
          <Link to="/" className={classes.logoBadge} aria-label={uiText("public:siteLayout.cvStudioHomepage")}><img src="/cv-studio-logo.svg" alt="" /></Link>
          <p className={classes.cardEyebrow}>{uiText("auth:verifyEmail.emailVerification")}</p>
          <h1 id="verify-title" className={classes.mainHeading}>{state === "success" ? uiText("auth:verifyEmail.emailConfirmed") : state === "loading" ? uiText("auth:verifyEmail.checkingTheLink") : uiText("auth:verifyEmail.couldNotVerify")}</h1>
          <p className={state === "error" ? classes.error : classes.status} role={state === "error" ? "alert" : "status"}>{message}</p>
          {state === "success" ? <Link className={classes.authLinkButton} to={verifiedLogin}>{uiText("auth:verifyEmail.continueToSignIn")}</Link> : null}
          {state === "error" ? <Link className={classes.authLinkButton} to={loginBase}>{uiText("auth:verifyEmail.backToSignIn")}</Link> : null}
        </div>
      </section>
      <aside className={classes.storyPanel} aria-label={uiText("auth:verifyEmail.nextSteps")}>
        <div className={classes.storyCopy}><p className={classes.storyEyebrow}>01 / 02</p><h2>{uiText("auth:verifyEmail.afterVerificationYouCanReturnToYour")}</h2><p>{uiText("auth:verifyEmail.signInWithTheSameAccountTo")}</p></div>
      </aside>
    </main>
  );
}
