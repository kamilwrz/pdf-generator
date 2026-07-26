export function isTextareaEditGesture({ detail = 0, ctrlKey = false, metaKey = false }) {
    return detail >= 2 && !ctrlKey && !metaKey;
}

export function deferTextareaEdit({
    requestFrame,
    cancelFrame,
    pendingFrame,
    startEditing,
}) {
    if (pendingFrame.current) {
        cancelFrame(pendingFrame.current);
    }
    pendingFrame.current = requestFrame(() => {
        pendingFrame.current = null;
        startEditing();
    });
}
