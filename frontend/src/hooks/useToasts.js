import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_LIFETIME_MS = 6000;
const TOAST_EXIT_MS = 260;
const MAX_TOASTS = 3;

// Generic stacked-notification queue, extracted the same way useA4Elements/
// usePdfExport are — used for both the PDF-ready/error toast and the
// delete-document success toast so every notification in the app shares one
// visual system instead of one-off bespoke components.
export function useToasts() {
    const [toasts, setToasts] = useState([]);
    const timers = useRef({});
    const seqRef = useRef(0);

    const dismissToast = useCallback((id) => {
        clearTimeout(timers.current[id]);
        setToasts((prev) => prev.map((toast) => (
            toast.id === id ? { ...toast, exiting: true } : toast
        )));
        timers.current[id] = setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
            delete timers.current[id];
        }, TOAST_EXIT_MS);
    }, []);

    const pushToast = useCallback((toast) => {
        const id = ++seqRef.current;
        setToasts((prev) => [...prev, { ...toast, id }].slice(-MAX_TOASTS));
        timers.current[id] = setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS);
        return id;
    }, [dismissToast]);

    useEffect(() => () => {
        Object.values(timers.current).forEach(clearTimeout);
    }, []);

    return { toasts, pushToast, dismissToast };
}
