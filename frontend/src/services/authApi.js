import { t as uiText } from "../i18n/index.js";
/** Account-verification and federated-auth API adapters. */
import { ApiClient, ENDPOINTS } from "./api";
import { establishSession } from "./signIn";

export async function verifyEmail(token) {
  return new ApiClient().httpRequest(
    ENDPOINTS.AUTH.VERIFY_EMAIL,
    "POST",
    JSON.stringify({ token }),
    uiText("errors:authApi.couldNotVerifyYourEmailAddress"),
  );
}

export async function resendVerification(email) {
  return new ApiClient().httpRequest(
    ENDPOINTS.AUTH.RESEND_VERIFICATION,
    "POST",
    JSON.stringify({ email }),
    uiText("auth:login.couldNotSendANewLink"),
  );
}

export async function signInWithGoogle(credential) {
  const data = await new ApiClient().httpRequest(
    ENDPOINTS.AUTH.GOOGLE,
    "POST",
    JSON.stringify({ credential }),
    uiText("auth:login.googleSignInFailed"),
  );
  establishSession(data);
  return data;
}

export async function linkGoogle(credential) {
  const token = localStorage.getItem("token");
  return new ApiClient({ Authorization: `Bearer ${token}` }).httpRequest(
    ENDPOINTS.AUTH.GOOGLE_LINK,
    "POST",
    JSON.stringify({ credential }),
    uiText("errors:authApi.couldNotConnectYourGoogleAccount"),
  );
}
