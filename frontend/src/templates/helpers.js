// Factory helpers for authoring CV templates as plain element specs.
// The loader (useA4Elements.handleLoadTemplate) assigns element_id + page and
// merges interaction defaults (isSelected/isMove/isEditing). Only fonts the
// backend can render are used: Inter / Roboto / Times-Roman / Helvetica / Courier.

export const text = (content, fontSize, fontFamily, color, left, top, zIndex = 2) =>
    ({ category: "text", content, fontSize, fontFamily, color, left, top, zIndex });

// `line` is a filled rectangle (the only decoration primitive): rules, bands,
// sidebar backgrounds, photo placeholder boxes.
export const line = (left, top, width, height, backgroundColor, zIndex = 1) =>
    ({ category: "line", left, top, width, height, backgroundColor, zIndex });

export const circle = (left, top, diameter, backgroundColor, filled = false, borderWidth = 1, zIndex = 1) =>
    ({
        category: "circle",
        left, top,
        width: diameter,
        height: diameter,
        backgroundColor,
        filled,
        borderWidth,
        zIndex,
    });

export const ellipse = (left, top, width, height, backgroundColor, filled = false, borderWidth = 1, zIndex = 1) =>
    ({
        category: "ellipse",
        left, top, width, height,
        backgroundColor,
        filled,
        borderWidth,
        zIndex,
    });

// `block` is a metric-exact textarea — multi-line bodies wrap in the PDF exactly
// as they do on the canvas.
export const block = (
    content, left, top, width, height, fontSize, lineHeight,
    color = "#2B2B2B", fontFamily = "Inter", letterSpacing = 0, zIndex = 2
) => ({
    category: "textarea",
    content, left, top, width, height,
    fontSize, fontFamily, color, lineHeight, letterSpacing, zIndex,
    // Template text uses its rendered natural height after load. The authored
    // height is only the initial geometry before the canvas measures it.
    autoHeight: true,
});

// Marks a block's "•" lines for hanging-indent wrapping (canvas + PDF).
export const bulleted = (el) => ({ ...el, bulletList: true });
