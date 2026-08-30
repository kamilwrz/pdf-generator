import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import classes from "./Spinner.module.css";

/** Screen-space gap from the A4 canvas top edge to the status card top. */
const CANVAS_TOP_OFFSET_PX = 100;

/**
 * PDF export loading state: flat, high-contrast status surface pinned 100px
 * below the live A4 page top (viewport pixels via
 * `getBoundingClientRect`, so canvas zoom does not change the offset).
 *
 * @param {{ loading?: boolean, anchorRef?: React.RefObject<HTMLElement|null> }} props
 *   `anchorRef` — the current page's `.page-canvas` node (scaled A4 surface).
 */
export default function Spinner({ loading = true, anchorRef = null }) {
    const [cardSlotStyle, setCardSlotStyle] = useState(null);

    useLayoutEffect(() => {
        if (!loading) {
            // Reset viewport coordinates between export runs so a later run
            // never flashes at the previous document's measured position.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCardSlotStyle(null);
            return undefined;
        }

        const placeCard = () => {
            const canvas = anchorRef?.current
                ?? document.querySelector(".page-canvas");
            if (!canvas) {
                // Fallback: keep the card near the top of the viewport until
                // the page node mounts (first paint of a fresh document).
                setCardSlotStyle({
                    top: CANVAS_TOP_OFFSET_PX,
                    left: "50%",
                });
                return;
            }
            const rect = canvas.getBoundingClientRect();
            setCardSlotStyle({
                top: rect.top + CANVAS_TOP_OFFSET_PX,
                left: rect.left + rect.width / 2,
            });
        };

        placeCard();
        window.addEventListener("resize", placeCard);
        const area = document.querySelector(".canvas-area");
        area?.addEventListener("scroll", placeCard, { passive: true });
        return () => {
            window.removeEventListener("resize", placeCard);
            area?.removeEventListener("scroll", placeCard);
        };
    }, [loading, anchorRef]);

    if (!loading) return null;

    return createPortal(
        <div className={classes.overlay} role="status" aria-live="polite" aria-label="Generowanie PDF">
            <div className={classes.cardSlot} style={cardSlotStyle ?? undefined}>
                <div className={classes.card}>
                    <div className={classes.stage}>
                        <span className={classes.ring} aria-hidden="true" />
                        <span className={classes.page} aria-hidden="true">
                            <i className={classes.corner} />
                            <span className={classes.line} />
                            <span className={classes.line} />
                            <span className={classes.line} />
                            <span className={classes.line} />
                        </span>
                    </div>
                    <div className={classes.title}>Generowanie PDF</div>
                    <div className={classes.subtitle}>Układanie stron i renderowanie</div>
                    <div className={classes.bar}><span /></div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
