/**
 * Smooth single-page A4 transition when `currentPage` changes (wheel edge or
 * PageControls). Two-page spread stays unanimated — both sheets are already
 * visible side by side.
 *
 * Direction follows the page step: next slides up subtly, previous slides down.
 * Honours `prefers-reduced-motion` with a quick opacity crossfade only.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import classes from "./CanvasPageStage.module.css";

const SLIDE_PX = 36;

/**
 * @param {number} direction 1 = forward (higher page), -1 = back
 */
function pageVariants(reduceMotion) {
    if (reduceMotion) {
        return {
            enter: { opacity: 0 },
            center: { opacity: 1 },
            exit: { opacity: 0 },
        };
    }
    return {
        enter: (direction) => ({
            opacity: 0,
            y: direction >= 0 ? SLIDE_PX : -SLIDE_PX,
        }),
        center: {
            opacity: 1,
            y: 0,
        },
        exit: (direction) => ({
            opacity: 0,
            y: direction >= 0 ? -SLIDE_PX * 0.7 : SLIDE_PX * 0.7,
        }),
    };
}

/**
 * @param {{
 *   pageKey: number|string,
 *   direction: number,
 *   animate: boolean,
 *   children: import("react").ReactNode,
 * }} props
 */
export default function CanvasPageStage({ pageKey, direction, animate, children }) {
    const reduceMotion = useReducedMotion();
    const variants = pageVariants(Boolean(reduceMotion));

    if (!animate) {
        return <div className={classes.stage}>{children}</div>;
    }

    return (
        <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
                key={pageKey}
                className={classes.stage}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                    duration: reduceMotion ? 0.12 : 0.32,
                    ease: [0.22, 1, 0.36, 1],
                }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
