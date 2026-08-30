/**
 * Selection and pointer-drag behaviour for A4 canvas elements.
 *
 * Owns group-move HUD state, drag refs, select/move handlers, and the window
 * safety nets that finish a drag when pointer capture is lost (cross-page
 * remount). Injected setters/refs keep this hook independent of CRUD/history.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { findPageCanvasAtPoint } from "../utils/pageSpread";
import { moveElementsByDelta, moveElementsToPage } from "../utils/pageDrag";
import { isDecorativeChrome } from "../utils/elementInteraction";
import { canFreePositionElement } from "../utils/editorMode";

/**
 * @param {object} options
 * @param {React.MutableRefObject<object[]>} options.elementsRef
 * @param {React.MutableRefObject<{width:number,height:number}>} options.pageSizeRef
 * @param {(page: number) => HTMLElement|null|undefined} options.canvasForPage
 * @param {() => {page:number,node:HTMLElement}[]} options.visibleCanvasEntries
 * @param {React.MutableRefObject<string>} [options.editorModeRef]
 * @param {(updater: any) => void} options.setElements
 * @param {(updater: any) => void} options.setDeletedElements
 */
export function useElementSelectionDrag({
  elementsRef,
  pageSizeRef,
  canvasForPage,
  visibleCanvasEntries,
  editorModeRef,
  setElements,
  setDeletedElements,
}) {
  const [groupMoveDelta, setGroupMoveDelta] = useState(null);
  const draggedElementIdsRef = useRef(new Set());
  const activeDragElementIdRef = useRef(null);
  const crossPageDragRef = useRef(false);
  const dragDimensionsRef = useRef(null);
  const dragGrabOffsetRef = useRef(null);
  const groupDragRef = useRef(null);

  const clearSelection = useCallback(() => {
    setElements((prev) => (prev.some((e) => e.isSelected)
      ? prev.map((e) => (e.isSelected ? { ...e, isSelected: false } : e))
      : prev));
  }, [setElements]);

  const handleMoveElement = useCallback((e, elementId) => {
    if ((e.buttons & 1) !== 1) return;
    if (crossPageDragRef.current && e.currentTarget !== window) return;

    const currentElements = elementsRef.current;
    const currentDragged = currentElements.find((element) => element.element_id === elementId);
    if (!currentDragged?.isMove || currentDragged.locked) return;
    if (!canFreePositionElement(currentDragged, editorModeRef?.current)) return;
    const sourcePage = currentDragged.page ?? 1;
    const targetCanvas = findPageCanvasAtPoint(visibleCanvasEntries(), e.clientX, e.clientY);
    const targetPage = targetCanvas?.page ?? sourcePage;
    if (targetPage !== sourcePage) crossPageDragRef.current = true;
    const canvas = targetCanvas?.node ?? canvasForPage(sourcePage);
    const canvasRect = canvas?.getBoundingClientRect();
    if (!canvasRect) return;
    const scaleX = canvasRect.width / pageSizeRef.current.width;
    const scaleY = canvasRect.height / pageSizeRef.current.height;
    if (!scaleX || !scaleY) return;

    const sourceCanvasRect = canvasForPage(sourcePage)?.getBoundingClientRect();
    if (e.currentTarget && e.currentTarget !== window && sourceCanvasRect) {
      const elementRect = e.currentTarget.getBoundingClientRect();
      const sourceScaleX = sourceCanvasRect.width / pageSizeRef.current.width;
      const sourceScaleY = sourceCanvasRect.height / pageSizeRef.current.height;
      if (sourceScaleX && sourceScaleY) {
        dragDimensionsRef.current = {
          width: elementRect.width / sourceScaleX,
          height: elementRect.height / sourceScaleY,
        };
      }
    }
    // Keep the original grab point under the cursor (1:1). Slowing the element
    // relative to the pointer makes the cursor leave the element.
    const pointerX = (e.clientX - canvasRect.left) / scaleX;
    const pointerY = (e.clientY - canvasRect.top) / scaleY;
    if (!dragGrabOffsetRef.current) {
      dragGrabOffsetRef.current = {
        x: pointerX - Number(currentDragged.left),
        y: pointerY - Number(currentDragged.top),
      };
    }
    const targetLeft = pointerX - dragGrabOffsetRef.current.x;
    const targetTop = pointerY - dragGrabOffsetRef.current.y;
    const deltaX = targetLeft - Number(currentDragged.left);
    const deltaY = targetTop - Number(currentDragged.top);
    if (!deltaX && !deltaY && targetPage === sourcePage) return;
    const selectedOnSamePage = currentElements.filter((element) => (
      element.isSelected
      && !element.locked
      && (element.page ?? 1) === sourcePage
    ));
    const movedElements = currentDragged.isSelected && selectedOnSamePage.length > 1
      ? selectedOnSamePage
      : [currentDragged];
    const movedIds = new Set(movedElements.map((element) => element.element_id));
    const moveResult = moveElementsToPage(
      currentElements,
      movedIds,
      deltaX,
      deltaY,
      targetPage,
      pageSizeRef.current,
    );
    const groupDrag = groupDragRef.current;
    const origin = groupDrag?.origins.get(elementId);
    if (groupDrag?.elementIds.has(elementId) && origin) {
      setGroupMoveDelta({
        x: Math.round((currentDragged.left + moveResult.deltaX - origin.left) * 10) / 10,
        y: Math.round((currentDragged.top + moveResult.deltaY - origin.top) * 10) / 10,
        count: groupDrag.elementIds.size,
        elementId,
        page: targetPage,
        originPage: groupDrag.originPage,
      });
    }

    setElements((prevState) => {
      const dragged = prevState.find((element) => element.element_id === elementId);
      if (!dragged?.isMove || dragged.locked) return prevState;
      draggedElementIdsRef.current.add(elementId);

      const selectedSamePage = prevState.filter((element) => (
        element.isSelected
        && !element.locked
        && (element.page ?? 1) === sourcePage
      ));
      const toMove = dragged.isSelected && selectedSamePage.length > 1
        ? selectedSamePage
        : [dragged];
      const ids = new Set(toMove.map((element) => element.element_id));

      const moved = moveElementsToPage(
        prevState,
        ids,
        deltaX,
        deltaY,
        targetPage,
        pageSizeRef.current,
      );
      if (moved.removedConnectorIds.length > 0) {
        const removed = prevState.filter((element) => moved.removedConnectorIds.includes(element.element_id));
        setDeletedElements((previousDeleted) => {
          const additions = removed
            .filter((element) => !previousDeleted.some((deleted) => deleted.element_id === element.element_id))
            .map((element) => ({ ...element, deleted: true }));
          return additions.length > 0 ? [...previousDeleted, ...additions] : previousDeleted;
        });
      }
      return moved.elements;
    });
  }, [canvasForPage, editorModeRef, elementsRef, pageSizeRef, setDeletedElements, setElements, visibleCanvasEntries]);

  // Moving an element to the neighbour page remounts it in a different A4
  // surface, which releases its original pointer capture. Continue listening
  // from window for that one drag so the user can still position the element.
  useEffect(() => {
    const continueCrossPageDrag = (event) => {
      const elementId = activeDragElementIdRef.current;
      if (!crossPageDragRef.current || !elementId) return;
      handleMoveElement(event, elementId);
    };
    window.addEventListener("pointermove", continueCrossPageDrag, true);
    return () => window.removeEventListener("pointermove", continueCrossPageDrag, true);
  }, [handleMoveElement]);

  const handleMoveSelectedElements = useCallback((deltaX = 0, deltaY = 0) => {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

    setElements((prevState) => {
      const mode = editorModeRef?.current;
      const selectedIds = new Set(
        prevState
          .filter((element) => (
            element.isSelected
            && !element.locked
            && canFreePositionElement(element, mode)
          ))
          .map((element) => element.element_id),
      );
      if (selectedIds.size === 0) return prevState;
      return moveElementsByDelta(
        prevState,
        selectedIds,
        deltaX,
        deltaY,
        pageSizeRef.current,
      );
    });
  }, [editorModeRef, pageSizeRef, setElements]);

  // Explicit press/release drag state: pointerdown passes moving=true,
  // pointerup moving=false. NEVER a toggle — a toggle inverts permanently the
  // moment a pointerup is missed (e.g. the element remounts when selecting it
  // swaps in the <Resize>-wrapped branch and the pointer capture dies).
  const handleSelectMoveElement = useCallback((elementId, moving) => {
    const dragged = moving
      ? elementsRef.current.find((element) => element.element_id === elementId)
      : null;

    // Decorative chrome (bg / frames / sidebars / page nums) is never draggable.
    if (moving && isDecorativeChrome(dragged)) return;
    // Template mode keeps layout-owned content fixed; freeform allows drag.
    if (moving && !canFreePositionElement(dragged, editorModeRef?.current)) return;

    if (moving) {
      draggedElementIdsRef.current.delete(elementId);
      activeDragElementIdRef.current = elementId;
      crossPageDragRef.current = false;
      dragDimensionsRef.current = null;
      dragGrabOffsetRef.current = null;
      const mode = editorModeRef?.current;
      const group = dragged?.isSelected
        ? elementsRef.current.filter((element) => (
          element.isSelected
          && !element.locked
          && canFreePositionElement(element, mode)
          && (element.page ?? 1) === (dragged.page ?? 1)
        ))
        : [dragged].filter(Boolean);
      if (group.length > 0) {
        groupDragRef.current = {
          elementIds: new Set(group.map((element) => element.element_id)),
          originPage: dragged?.page ?? 1,
          origins: new Map(group.map((element) => [
            element.element_id,
            { left: Number(element.left) || 0, top: Number(element.top) || 0 },
          ])),
        };
        setGroupMoveDelta({ x: 0, y: 0, count: group.length, elementId });
      } else {
        groupDragRef.current = null;
        setGroupMoveDelta(null);
      }
    } else {
      // Click follows pointerup in the same interaction. Delay cleanup by one
      // task so handleSelectElement can recognise and ignore that post-drag
      // click, preserving the current group selection.
      window.setTimeout(() => draggedElementIdsRef.current.delete(elementId), 0);
      activeDragElementIdRef.current = null;
      crossPageDragRef.current = false;
      dragDimensionsRef.current = null;
      dragGrabOffsetRef.current = null;
      groupDragRef.current = null;
      setGroupMoveDelta(null);
    }
    setElements((prevState) => prevState.map((element) => (
      element.element_id === elementId
        ? {
          ...element,
          isMove: !!moving
            && !element.locked
            && canFreePositionElement(element, editorModeRef?.current),
        }
        : { ...element, isMove: false }
    )));
  }, [editorModeRef, elementsRef, setElements]);

  // Safety net: releasing the button ANYWHERE ends every drag, even when the
  // dragged element lost its pointer capture and its own pointerup never fired.
  useEffect(() => {
    const endDrag = () => {
      activeDragElementIdRef.current = null;
      crossPageDragRef.current = false;
      dragDimensionsRef.current = null;
      dragGrabOffsetRef.current = null;
      groupDragRef.current = null;
      setGroupMoveDelta(null);
      setElements((prev) => (prev.some((e) => e.isMove)
        ? prev.map((e) => (e.isMove ? { ...e, isMove: false } : e))
        : prev));
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [setElements]);

  // Normal click makes one element the active selection. Ctrl/Cmd-click toggles
  // only that element, preserving the rest of the selection for bulk editing.
  const handleSelectElement = useCallback((elementId, additive = false) => {
    if (!additive && draggedElementIdsRef.current.delete(elementId)) return;

    const target = elementsRef.current.find((element) => element.element_id === elementId);
    // Decorative chrome must stay unselectable so it never steals clicks from content.
    if (isDecorativeChrome(target)) return;

    setElements((prevState) => prevState.map((element) => {
      if (element.element_id === elementId) {
        return {
          ...element,
          isSelected: additive ? !element.isSelected : true,
          isMove: false,
          isEditing: element.category === "textarea" ? false : element.isEditing,
        };
      }
      return additive
        ? { ...element, isMove: false, isEditing: element.category === "textarea" ? false : element.isEditing }
        : {
            ...element,
            isSelected: false,
            isMove: false,
            isEditing: element.category === "textarea" ? false : element.isEditing,
          };
    }));
  }, [elementsRef, setElements]);

  // Select an element without toggling (used by the text box on single click).
  const markSelected = useCallback((elementId) => {
    handleSelectElement(elementId);
  }, [handleSelectElement]);

  return {
    groupMoveDelta,
    clearSelection,
    handleMoveElement,
    handleMoveSelectedElements,
    handleSelectMoveElement,
    handleSelectElement,
    markSelected,
  };
}
