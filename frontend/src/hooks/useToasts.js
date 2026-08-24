import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_LIFETIME_MS = 6000;
const TOAST_EXIT_MS = 260;
const MAX_TOASTS = 3;

/**
 * Adds a toast while replacing an older notification from the same workflow.
 *
 * `replaceKey` is intentionally optional: unrelated events may still coexist,
 * while rapid state changes such as template selection keep only their newest
 * result. The function is pure so queue semantics can be regression-tested
 * without mounting React.
 */
export function mergeToastQueue(previousToasts, toast, maxToasts = MAX_TOASTS) {
    const retainedToasts = toast.replaceKey
        ? previousToasts.filter((item) => item.replaceKey !== toast.replaceKey)
        : previousToasts;
    return [...retainedToasts, toast].slice(-maxToasts);
}

// Generic stacked-notification queue, extracted the same way useA4Elements/
// usePdfExport are — used for both the PDF-ready/error toast and the
// delete-document success toast so every notification in the app shares one
// visual system instead of one-off bespoke components.
export function useToasts() {
    const [toasts, setToasts] = useState([]);
    const timers = useRef({});
    const replacementIds = useRef({});
    const seqRef = useRef(0);

    const dismissToast = useCallback((id) => {
        clearTimeout(timers.current[id]);
        setToasts((prev) => prev.map((toast) => (
            toast.id === id ? { ...toast, exiting: true } : toast
        )));
        timers.current[id] = setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => {
                if (toast.id !== id) return true;
                if (toast.replaceKey && replacementIds.current[toast.replaceKey] === id) {
                    delete replacementIds.current[toast.replaceKey];
                }
                return false;
            }));
            delete timers.current[id];
        }, TOAST_EXIT_MS);
    }, []);

    const pushToast = useCallback((toast) => {
        const id = ++seqRef.current;
        const nextToast = { ...toast, id };
        // A replaced toast must not leave a live timeout that later tries to
        // dismiss a newer notification from the same workflow.
        const replacedId = toast.replaceKey ? replacementIds.current[toast.replaceKey] : null;
        if (replacedId) {
            clearTimeout(timers.current[replacedId]);
            delete timers.current[replacedId];
        }
        if (toast.replaceKey) replacementIds.current[toast.replaceKey] = id;
        setToasts((prev) => mergeToastQueue(prev, nextToast));
        timers.current[id] = setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS);
        return id;
    }, [dismissToast]);

    useEffect(() => () => {
        Object.values(timers.current).forEach(clearTimeout);
    }, []);

    return { toasts, pushToast, dismissToast };
}
