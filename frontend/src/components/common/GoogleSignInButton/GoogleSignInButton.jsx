/** Google-rendered button that keeps provider branding and accessibility intact. */
import { useEffect, useId, useRef, useState } from "react";
import classes from "./GoogleSignInButton.module.css";
import { resolveGoogleButtonGeometry } from "./googleButtonGeometry";

const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() || "";
const SCRIPT_ID = "google-identity-services";

export default function GoogleSignInButton({ onCredential, disabled = false, label = "signin_with" }) {
  const frameRef = useRef(null);
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
    let resizeObserver;
    let lastWidth = 0;

    const render = () => {
      if (cancelled || !frameRef.current || !containerRef.current || !window.google?.accounts?.id) return;
      const availableWidth = Math.floor(frameRef.current.clientWidth);
      if (availableWidth <= 0 || availableWidth === lastWidth) return;
      lastWidth = availableWidth;
      const geometry = resolveGoogleButtonGeometry(availableWidth);
      frameRef.current.style.setProperty("--google-button-scale", String(geometry.scale));
      frameRef.current.style.setProperty("--google-button-height", `${geometry.renderedHeight}px`);
      containerRef.current.style.width = `${geometry.providerWidth}px`;
      containerRef.current.replaceChildren();
      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: label,
        shape: "rectangular",
        width: geometry.providerWidth,
        locale: "pl",
      });
      setState("ready");
    };

    const start = () => {
      if (cancelled || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => callbackRef.current?.(response?.credential),
      });
      render();

      // The auth layout reflows at compact widths and browser zoom. Observe
      // the actual host width so the provider control remains edge-aligned
      // without introducing horizontal overflow.
      if (typeof ResizeObserver === "function" && frameRef.current) {
        resizeObserver = new ResizeObserver(render);
        resizeObserver.observe(frameRef.current);
      } else {
        window.addEventListener("resize", render);
      }
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (window.google?.accounts?.id) start();
    else if (existing) existing.addEventListener("load", start, { once: true });
    else {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", start, { once: true });
      script.addEventListener("error", () => !cancelled && setState("error"), { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", render);
      existing?.removeEventListener("load", start);
    };
  }, [disabled, label]);

  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div ref={frameRef} className={classes.frame} aria-describedby={statusId}>
      <div ref={containerRef} className={classes.providerButton} aria-hidden={disabled || undefined} />
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {state === "loading" ? "Ładowanie logowania Google." : state === "error" ? "Logowanie Google jest niedostępne." : ""}
      </p>
    </div>
  );
}
