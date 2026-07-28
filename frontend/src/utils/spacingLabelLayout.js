/**
 * Place spacing-guide labels so they do not cover each other.
 * Returns a Map keyed by guide identity → { side, nudge }.
 *
 * Y labels sit beside the vertical rail (left | right).
 * X labels sit above/below the horizontal rail (above | below).
 */

export function estimateLabelSize(gap) {
  const text = `${Math.round(Number(gap) || 0)} px`;
  // Matches Guides.module.css: ~8px bold + tight padding.
  const width = Math.max(22, Math.round(text.length * 4.8 + 6));
  const height = 11;
  return { width, height, text };
}

function guideKey(guide, axis) {
  return [
    axis,
    guide.direction || "",
    guide.neighborId || "",
    guide.kind || "",
    Math.round(guide.gap ?? 0),
    Math.round(guide.x ?? guide.x1 ?? 0),
    Math.round(guide.y ?? guide.y1 ?? 0),
  ].join(":");
}

function rectsOverlap(a, b, pad = 3) {
  return !(
    a.left + a.width + pad <= b.left
    || b.left + b.width + pad <= a.left
    || a.top + a.height + pad <= b.top
    || b.top + b.height + pad <= a.top
  );
}

function yLabelRect(guide, side, size, nudgeY = 0) {
  const x = Number(guide.x) || 0;
  const midY = ((Number(guide.y1) || 0) + (Number(guide.y2) || 0)) / 2 + nudgeY;
  const gap = 5;
  return {
    left: side === "left" ? x - gap - size.width : x + gap,
    top: midY - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function xLabelRect(guide, side, size, nudgeX = 0) {
  const y = Number(guide.y) || 0;
  const midX = ((Number(guide.x1) || 0) + (Number(guide.x2) || 0)) / 2 + nudgeX;
  const gap = 5;
  return {
    left: midX - size.width / 2,
    top: side === "above" ? y - gap - size.height : y + gap,
    width: size.width,
    height: size.height,
  };
}

function preferredYSide(guide) {
  // Mirror about the element: above-gap label to the left, below to the right.
  if (guide.direction === "above") return "left";
  return "right";
}

function preferredXSide(guide) {
  if (guide.kind === "page-edge" || guide.direction?.startsWith("page-")) return "above";
  if (guide.direction === "left") return "above";
  return "below";
}

function alternateY(side) {
  return side === "left" ? "right" : "left";
}

function alternateX(side) {
  return side === "above" ? "below" : "above";
}

/**
 * @param {{ y?: object[], x?: object[] }} guides
 * @returns {Map<string, { side: string, nudge: number }>}
 */
export function resolveSpacingLabelLayouts({ y = [], x = [] } = {}) {
  const layouts = new Map();
  const placed = [];

  const tryPlace = (rect) => !placed.some((other) => rectsOverlap(rect, other));

  for (const guide of y.filter(Boolean)) {
    const key = guideKey(guide, "y");
    const size = estimateLabelSize(guide.gap);
    let side = preferredYSide(guide);
    let nudge = 0;
    let rect = yLabelRect(guide, side, size, nudge);

    if (!tryPlace(rect)) {
      side = alternateY(side);
      rect = yLabelRect(guide, side, size, nudge);
    }

    if (!tryPlace(rect)) {
      // Nudge along the rail until clear or give up after a few steps.
      const railSpan = Math.max(0, (Number(guide.y2) || 0) - (Number(guide.y1) || 0));
      const step = size.height + 2;
      let found = false;
      for (const delta of [step, -step, step * 2, -step * 2, step * 3, -step * 3]) {
        if (Math.abs(delta) > railSpan / 2 + size.height) continue;
        const candidate = yLabelRect(guide, side, size, delta);
        if (tryPlace(candidate)) {
          nudge = delta;
          rect = candidate;
          found = true;
          break;
        }
        const flipped = alternateY(side);
        const flippedRect = yLabelRect(guide, flipped, size, delta);
        if (tryPlace(flippedRect)) {
          side = flipped;
          nudge = delta;
          rect = flippedRect;
          found = true;
          break;
        }
      }
      if (!found) {
        // Last resort: keep preferred side; still register so later labels avoid it.
        side = preferredYSide(guide);
        nudge = 0;
        rect = yLabelRect(guide, side, size, nudge);
      }
    }

    layouts.set(key, { side, nudge, axis: "y" });
    placed.push(rect);
  }

  for (const guide of x.filter(Boolean)) {
    const key = guideKey(guide, "x");
    const size = estimateLabelSize(guide.gap);
    let side = preferredXSide(guide);
    let nudge = 0;
    let rect = xLabelRect(guide, side, size, nudge);

    if (!tryPlace(rect)) {
      side = alternateX(side);
      rect = xLabelRect(guide, side, size, nudge);
    }

    if (!tryPlace(rect)) {
      const railSpan = Math.max(0, (Number(guide.x2) || 0) - (Number(guide.x1) || 0));
      const step = size.width + 2;
      let found = false;
      for (const delta of [step, -step, step * 2, -step * 2, step * 3, -step * 3]) {
        if (Math.abs(delta) > railSpan / 2 + size.width) continue;
        const candidate = xLabelRect(guide, side, size, delta);
        if (tryPlace(candidate)) {
          nudge = delta;
          rect = candidate;
          found = true;
          break;
        }
        const flipped = alternateX(side);
        const flippedRect = xLabelRect(guide, flipped, size, delta);
        if (tryPlace(flippedRect)) {
          side = flipped;
          nudge = delta;
          rect = flippedRect;
          found = true;
          break;
        }
      }
      if (!found) {
        side = preferredXSide(guide);
        nudge = 0;
        rect = xLabelRect(guide, side, size, nudge);
      }
    }

    layouts.set(key, { side, nudge, axis: "x" });
    placed.push(rect);
  }

  return layouts;
}

export function spacingGuideKey(guide, axis) {
  return guideKey(guide, axis);
}
