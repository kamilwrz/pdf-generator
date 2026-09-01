/**
 * One unsaved-change guard for route exits and in-editor document replacement.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

export function useDirtyGuard({ signature, isGuest, flushGuestDraft }) {
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const [baselineSignature, setBaselineSignature] = useState(signature);
  const dirty = signature !== baselineSignature;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const guestRef = useRef(isGuest);
  guestRef.current = isGuest;
  const flushGuestDraftRef = useRef(flushGuestDraft);
  flushGuestDraftRef.current = flushGuestDraft;
  const allowNextNavigationRef = useRef(false);
  const pendingPromiseRef = useRef(null);
  const pendingResolverRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const markClean = useCallback((nextSignature = signatureRef.current) => {
    setBaselineSignature(nextSignature);
  }, []);

  const allowNextNavigation = useCallback(() => {
    allowNextNavigationRef.current = true;
  }, []);

  const settleDialog = useCallback((confirmed) => {
    const resolve = pendingResolverRef.current;
    pendingResolverRef.current = null;
    pendingPromiseRef.current = null;
    saveInFlightRef.current = false;
    setDialogOpen(false);
    setDialogSaving(false);
    setDialogError("");
    resolve?.(confirmed);
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return Promise.resolve(true);
    if (guestRef.current) {
      flushGuestDraftRef.current?.();
      return Promise.resolve(true);
    }
    if (pendingPromiseRef.current) return pendingPromiseRef.current;
    setDialogError("");
    setDialogOpen(true);
    const pending = new Promise((resolve) => {
      pendingResolverRef.current = resolve;
    });
    pendingPromiseRef.current = pending;
    return pending;
  }, []);

  /**
   * Persist the exact current snapshot before resolving a pending replacement.
   *
   * The save callback must resolve `true` only after the backend confirms the
   * write and the editor marks that submitted signature clean. A conflict or
   * transport error leaves both the dialog and the pending navigation intact,
   * so the user can retry, discard explicitly, or return to the document.
   */
  const confirmDialogSave = useCallback(async (saveCurrentDocument) => {
    if (saveInFlightRef.current || typeof saveCurrentDocument !== "function") return false;
    saveInFlightRef.current = true;
    setDialogSaving(true);
    setDialogError("");
    try {
      const saved = await saveCurrentDocument();
      if (saved !== true) {
        throw new Error("Nie udało się potwierdzić zapisu dokumentu.");
      }
      settleDialog(true);
      return true;
    } catch (error) {
      setDialogError(
        error?.message || "Nie udało się zapisać dokumentu. Spróbuj ponownie.",
      );
      return false;
    } finally {
      saveInFlightRef.current = false;
      setDialogSaving(false);
    }
  }, [settleDialog]);

  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => {
    if (allowNextNavigationRef.current) {
      allowNextNavigationRef.current = false;
      return false;
    }
    if (!dirtyRef.current) return false;
    return (
      currentLocation.pathname !== nextLocation.pathname
      || currentLocation.search !== nextLocation.search
    );
  }, []));

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    confirmDiscard().then((confirmed) => {
      if (!active || blocker.state !== "blocked") return;
      if (confirmed) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker, confirmDiscard]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirtyRef.current) return;
      if (guestRef.current) flushGuestDraftRef.current?.();
      event.preventDefault();
      event.returnValue = "";
    };
    const onPageHide = () => {
      if (dirtyRef.current && guestRef.current) flushGuestDraftRef.current?.();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => () => {
    pendingResolverRef.current?.(false);
  }, []);

  return {
    dirty,
    dialogOpen,
    dialogSaving,
    dialogError,
    confirmDiscard,
    confirmDialogDiscard: () => settleDialog(true),
    confirmDialogSave,
    cancelDialogDiscard: () => settleDialog(false),
    markClean,
    allowNextNavigation,
  };
}
