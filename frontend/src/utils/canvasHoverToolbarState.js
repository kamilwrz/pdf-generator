/**
 * State transitions for canvas hover toolbars.
 *
 * Keeping the transition rules pure makes the interaction predictable across
 * section and record controls: hover reveals a toolbar, a click pins it, and
 * an outside click or a completed action clears it. Menu state pins the
 * toolbar so moving the pointer into the popover cannot start a hide timer.
 */
export const CANVAS_TOOLBAR_INITIAL_STATE = Object.freeze({
  visible: false,
  pinned: false,
  menuOpen: false,
});

/**
 * Time in milliseconds that a transient toolbar remains visible after leave.
 *
 * The toolbar lives outside the A4 content, and in a two-page spread it moves
 * to the outer page edge. One second gives the pointer enough time to cross
 * that distance without making the toolbar feel permanently sticky.
 */
export const CANVAS_TOOLBAR_HIDE_DELAY_MS = 1_000;

/**
 * Reduce one canvas-toolbar interaction event.
 *
 * @param {{visible:boolean,pinned:boolean,menuOpen:boolean}} state
 * @param {{type:string}} event
 * @returns {{visible:boolean,pinned:boolean,menuOpen:boolean}}
 */
export function reduceCanvasHoverToolbarState(state, event) {
  switch (event.type) {
    case "SHOW":
      return state.visible ? state : { ...state, visible: true };
    case "PIN":
      return { visible: true, pinned: true, menuOpen: state.menuOpen };
    case "OPEN_MENU":
      return { visible: true, pinned: true, menuOpen: true };
    case "CLOSE_MENU":
      return state.menuOpen ? { ...state, menuOpen: false } : state;
    case "HIDE_IF_TRANSIENT":
      return state.pinned || state.menuOpen
        ? state
        : CANVAS_TOOLBAR_INITIAL_STATE;
    case "RESET":
      return CANVAS_TOOLBAR_INITIAL_STATE;
    default:
      return state;
  }
}
