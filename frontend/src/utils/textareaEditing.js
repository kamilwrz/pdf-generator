export function isTextareaEditGesture({ detail = 0, ctrlKey = false, metaKey = false }) {
    return detail >= 2 && !ctrlKey && !metaKey;
}
