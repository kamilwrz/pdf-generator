/**
 * Creates recoverable canvas deletions for the section/record hover controls.
 *
 * The snapshot includes pending persistence tombstones and page count, not
 * only visible elements. Restoring all three keeps the next explicit Save from
 * deleting records that the user has just brought back through the toast.
 */
import { useCallback } from "react";
import { useCanvasContext } from "../store/canvas-context";
import { useSession } from "../store/session-context";

/**
 * @returns {(options:{title:string,msg?:string,remove:() => void}) => void}
 */
export function useCanvasDeletionUndo() {
  const {
    A4_Elements,
    A4_Elements_deleted,
    pageCount,
    setA4_Elements,
    setA4_Elements_deleted,
    setPageCount,
  } = useCanvasContext();
  const { pushToast } = useSession();

  return useCallback(({ title, msg, remove }) => {
    // Element updates are immutable throughout the editor, so retaining the
    // current object graph is a stable exact snapshot for this short-lived
    // undo window. Re-cloning it would only add cost for large two-page CVs.
    const snapshot = {
      elements: A4_Elements,
      deletedElements: A4_Elements_deleted,
      pageCount,
    };

    remove();
    pushToast?.({
      title,
      msg,
      variant: "success",
      replaceKey: "canvas-structural-delete",
      action: {
        label: "Cofnij",
        kind: "button",
        onClick: () => {
          setA4_Elements?.(snapshot.elements);
          setA4_Elements_deleted?.(snapshot.deletedElements);
          setPageCount?.(snapshot.pageCount);
        },
      },
    });
  }, [
    A4_Elements,
    A4_Elements_deleted,
    pageCount,
    pushToast,
    setA4_Elements,
    setA4_Elements_deleted,
    setPageCount,
  ]);
}
