/** Account-verification and federated-auth API adapters. */
import { ApiClient, ENDPOINTS } from "./api";
import { establishSession } from "./signIn";

export async function verifyEmail(token) {
  return new ApiClient().httpRequest(
    ENDPOINTS.AUTH.VERIFY_EMAIL,
    "POST",
    JSON.stringify({ token }),
    "Nie udało się potwierdzić adresu e-mail.",
  );
}

export async function resendVerification(email) {
  return new ApiClient().httpRequest(
    ENDPOINTS.AUTH.RESEND_VERIFICATION,
    "POST",
    JSON.stringify({ email }),
    "Nie udało się wysłać nowego linku.",
  );
}

export async function signInWithGoogle(credential) {
  const data = await new ApiClient().httpRequest(
    ENDPOINTS.AUTH.GOOGLE,
    "POST",
    JSON.stringify({ credential }),
    "Logowanie Google nie powiodło się.",
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
    "Nie udało się połączyć konta Google.",
  );
}
