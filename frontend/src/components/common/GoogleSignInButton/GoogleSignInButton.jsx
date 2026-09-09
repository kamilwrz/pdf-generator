/** Google-rendered button that keeps provider branding and accessibility intact. */
import { useEffect, useId, useRef, useState } from "react";

const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() || "";
const SCRIPT_ID = "google-identity-services";

export default function GoogleSignInButton({ onCredential, disabled = false, label = "signin_with" }) {
  const containerRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [state, setState] = useState(GOOGLE_CLIENT_ID ? "loading" : "disabled");
  const statusId = useId();

  useEffect(() => {
    // Google retains this callback after rendering its iframe. Refresh the
    // ref after commits so it always invokes the latest caller implementation.
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || disabled) {
      containerRef.current?.replaceChildren();
      return undefined;
    }
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;
      containerRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => callbackRef.current?.(response?.credential),
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: label,
        shape: "rectangular",
        width: Math.min(400, containerRef.current.clientWidth || 400),
        locale: "pl",
      });
      setState("ready");
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (window.google?.accounts?.id) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", () => !cancelled && setState("error"), { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      existing?.removeEventListener("load", render);
    };
  }, [disabled, label]);

  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div aria-describedby={statusId}>
      <div ref={containerRef} aria-hidden={disabled || undefined} />
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {state === "loading" ? "Ładowanie logowania Google." : state === "error" ? "Logowanie Google jest niedostępne." : ""}
      </p>
    </div>
  );
}
