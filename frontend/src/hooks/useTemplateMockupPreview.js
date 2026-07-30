/**
 * Hover mockup preview with opacity fade-out → asset swap → fade-in.
 *
 * Shared by AiCvPanel (PDF import) and BioCvModal (guided wizard summary)
 * so both template pickers behave identically.
 *
 * @param {object} options
 * @param {boolean} [options.active=true] - When false, clears preview (leaving
 *   the pick step or closing the dialog).
 * @returns {{
 *   previewId: string | null,
 *   previewVisible: boolean,
 *   showTemplatePreview: (templateId: string | null) => void,
 * }}
 */
import { useCallback, useEffect, useRef, useState } from "react";

const PREVIEW_FADE_MS = 180;

export function useTemplateMockupPreview({ active = true } = {}) {
    const fadeTimerRef = useRef(null);
    // Refs mirror preview state so rapid hover changes cancel cleanly mid-fade.
    const previewIdRef = useRef(null);
    const previewVisibleRef = useRef(false);
    const [previewId, setPreviewId] = useState(null);
    const [previewVisible, setPreviewVisible] = useState(false);

    const setPreviewIdSync = useCallback((id) => {
        previewIdRef.current = id;
        setPreviewId(id);
    }, []);

    const setPreviewVisibleSync = useCallback((visible) => {
        previewVisibleRef.current = visible;
        setPreviewVisible(visible);
    }, []);

    const clearTimers = useCallback(() => {
        if (fadeTimerRef.current) {
            window.clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = null;
        }
    }, []);

    useEffect(() => () => clearTimers(), [clearTimers]);

    useEffect(() => {
        if (active) return;
        clearTimers();
        setPreviewVisibleSync(false);
        setPreviewIdSync(null);
    }, [active, clearTimers, setPreviewIdSync, setPreviewVisibleSync]);

    const showTemplatePreview = useCallback((templateId) => {
        clearTimers();
        if (!templateId) {
            setPreviewVisibleSync(false);
            fadeTimerRef.current = window.setTimeout(() => {
                setPreviewIdSync(null);
                fadeTimerRef.current = null;
            }, PREVIEW_FADE_MS);
            return;
        }
        if (templateId === previewIdRef.current) {
            setPreviewVisibleSync(true);
            return;
        }
        // Fade out the current mockup, swap asset, fade in the next one.
        if (previewIdRef.current && previewVisibleRef.current) {
            setPreviewVisibleSync(false);
            fadeTimerRef.current = window.setTimeout(() => {
                setPreviewIdSync(templateId);
                fadeTimerRef.current = window.setTimeout(() => {
                    setPreviewVisibleSync(true);
                    fadeTimerRef.current = null;
                }, 16);
            }, PREVIEW_FADE_MS);
            return;
        }
        setPreviewIdSync(templateId);
        fadeTimerRef.current = window.setTimeout(() => {
            setPreviewVisibleSync(true);
            fadeTimerRef.current = null;
        }, 16);
    }, [clearTimers, setPreviewIdSync, setPreviewVisibleSync]);

    return { previewId, previewVisible, showTemplatePreview };
}

export { PREVIEW_FADE_MS };
