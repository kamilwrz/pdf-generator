export function hasTextareaDragIntent(start, event, threshold = 3) {
    if (!start || (event.buttons & 1) !== 1) return false;
    const deltaX = event.clientX - start.clientX;
    const deltaY = event.clientY - start.clientY;
    return (deltaX * deltaX) + (deltaY * deltaY) >= threshold * threshold;
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
