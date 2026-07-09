import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';

export function useA4Elements(titleRef) {

  const A4ref = useRef(null);

  const [A4_Elements, setA4_Elements] = useState([]);
  const [A4_Elements_deleted, setA4_Elements_deleted] = useState([]);

  // ---- Multi-page state ----
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  // Refs let the stable add-element callbacks read the latest page/elements
  // without being recreated on every page change.
  const currentPageRef = useRef(1);
  const elementsRef = useRef([]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { elementsRef.current = A4_Elements; }, [A4_Elements]);

  const clearSelection = useCallback(() => {
    setA4_Elements(prev => prev.some(e => e.isSelected)
      ? prev.map(e => (e.isSelected ? { ...e, isSelected: false } : e))
      : prev);
  }, []);

  const handleGoToPage = useCallback((page) => {
    setPageCount(count => {
      setCurrentPage(Math.min(Math.max(1, page), count));
      return count;
    });
    clearSelection();
  }, [clearSelection]);

  const handleAddPage = useCallback(() => {
    setPageCount(prev => {
      const next = prev + 1;
      setCurrentPage(next);
      return next;
    });
    clearSelection();
  }, [clearSelection]);

  const handleRemovePage = useCallback(() => {
    setPageCount(prevCount => {
      if (prevCount <= 1) return prevCount;

      // Read the page being removed from the ref so we don't depend on
      // currentPage in this callback.
      const removed = currentPageRef.current;

      // Track elements on the removed page as deletions so an update wipes
      // them from the DB (mirrors handleDeleteElement).
      const removedEls = elementsRef.current.filter(e => (e.page ?? 1) === removed);
      if (removedEls.length) {
        setA4_Elements_deleted(prevDel => {
          const additions = removedEls
            .filter(e => !prevDel.some(d => d.element_id === e.element_id))
            .map(e => ({ ...e, deleted: true }));
          return additions.length ? [...prevDel, ...additions] : prevDel;
        });
      }

      // Drop the page and shift every later page down by one.
      setA4_Elements(prev => prev
        .filter(e => (e.page ?? 1) !== removed)
        .map(e => {
          const p = e.page ?? 1;
          return { ...e, isSelected: false, page: p > removed ? p - 1 : p };
        }));

      const next = prevCount - 1;
      setCurrentPage(Math.min(removed, next));
      return next;
    });
  }, []);



  const handleMoveElement = useCallback((e, elementId) => {
    const A4 = e.currentTarget.closest('[class*="A4"]');
    const element = e.currentTarget.getBoundingClientRect()

    const newPositionLeft = e.pageX - A4.offsetLeft - (element.width / 2)
    const newPositionTop = e.pageY - A4.offsetTop - (element.height / 2)


    if (
      newPositionLeft < A4.clientWidth - element.width
      && newPositionLeft > 0
      && newPositionTop < A4.clientHeight - element.height
      && newPositionTop > 0) {

      setA4_Elements(prevState => {

        const newState = prevState.map((element) => {
          return elementId === element.element_id && element.isMove == true ? { ...element, left: newPositionLeft, top: newPositionTop } : element
        });
        return newState;
      });
    }
  }, [])

  const handleSelectMoveElement = useCallback((elementId) => {
    setA4_Elements(prevState => {
      const newState = prevState.map((element) => {
        console.log(element);
        return element.element_id === elementId ? { ...element, isMove: !element.isMove }
          : { ...element, isMove: false }
    });
      return newState;
    });
  }, [])

  const handleSelectElement = useCallback((elementId) => {
    setA4_Elements(prevState => {
      const newState = prevState.map((element) => (
        element.element_id === elementId ? { ...element, isSelected: !element.isSelected }
          : { ...element, isSelected: false }
      ));
      return newState;
    });
  }, [])

  const handleAddText = useCallback(() => {
    const text = {
      element_id: nanoid(),
      content: "Some text....",
      fontSize: 14,
      fontFamily: "Inter",
      color: "#000000",
      left: 10,
      top: 10,
      isSelected: false,
      isMove: false,
      category: "text",
      bold: false,
      italic: false,
      underline: false,
      zIndex: 3,
      page: currentPageRef.current,
    };
    setA4_Elements(prevState => {
      return [...prevState, text];
    });
  }, [])

  const handleAddLine = useCallback(() => {
    const line = {
      element_id: nanoid(),
      backgroundColor: "#000000",
      left: 10,
      width: 100,
      height: 10,
      top: 10,
      isSelected: false,
      isMove: false,
      category: "line",
      zIndex: 2,
      page: currentPageRef.current,
    };
    setA4_Elements(prevState => {
      return [...prevState, line];
    });
  }, [])

  const handleAddImage = useCallback((e) => {
    const image = {
      element_id: nanoid(),
      src: e.target.src,
      width: 100,
      height: e.target.naturalHeight / e.target.naturalWidth * 100,
      left: 10,
      top: 10,
      isSelected: false,
      isMove: false,
      category: "image",
      zIndex: 1,
      img_id : e.target.id,
      page: currentPageRef.current,
    };
    setA4_Elements(prevState => {
      return [...prevState, image];
    });
  }, [])

  const handleAddTextarea = useCallback(() => {
    const fontSize = 14;
    const textarea = {
      element_id: nanoid(),
      content: "",
      fontSize,
      fontFamily: "Inter",
      color: "#000000",
      lineHeight: Math.round(fontSize * 1.4),
      letterSpacing: 0,
      left: 20,
      top: 20,
      width: 260,
      height: 90,
      isSelected: true,
      isMove: false,
      isEditing: true,
      bold: false,
      italic: false,
      underline: false,
      align: "left",
      bulletList: false,
      category: "textarea",
      zIndex: 4,
      page: currentPageRef.current,
    };
    // New box starts in edit mode; clear selection/editing on everything else.
    setA4_Elements(prevState => [
      ...prevState.map(el => ({
        ...el,
        isSelected: false,
        isEditing: el.category === "textarea" ? false : el.isEditing,
      })),
      textarea,
    ]);
  }, [])

  // Select an element without toggling (used by the text box on single click)
  // and leave edit mode on any other text box.
  const markSelected = useCallback((elementId) => {
    setA4_Elements(prevState => prevState.map(el => (
      el.element_id === elementId
        ? { ...el, isSelected: true }
        : { ...el, isSelected: false, isEditing: el.category === "textarea" ? false : el.isEditing }
    )));
  }, [])

  const handleSetTextareaEditing = useCallback((elementId, editing) => {
    setA4_Elements(prevState => prevState.map(el => {
      if (el.element_id === elementId) {
        return { ...el, isEditing: editing, isSelected: true };
      }
      return el.category === "textarea" ? { ...el, isEditing: false } : el;
    }));
  }, [])

  
  // Clone the selected element: same size/text/colors/font/page, new id,
  // nudged 15px down-right so the copy is visibly distinct, then selected.
  const handleDuplicateElement = useCallback((elementId) => {
    setA4_Elements(prevState => {
      const original = prevState.find(el => el.element_id === elementId);
      if (!original) return prevState;

      const A4_WIDTH = 595;
      const A4_HEIGHT = 842;
      const OFFSET = 15;
      const w = parseFloat(original.width) || 0;
      const h = parseFloat(original.height) || 0;
      const left = Math.max(0, Math.min(original.left + OFFSET, A4_WIDTH - (w || 10)));
      const top = Math.max(0, Math.min(original.top + OFFSET, A4_HEIGHT - (h || 10)));

      const copy = {
        ...original,            // carries width/height/content/color/font/lineHeight/letterSpacing/src/img_id/backgroundColor/zIndex/page
        element_id: nanoid(),
        left,
        top,
        isSelected: true,       // copy becomes the active element
        isMove: false,
        isEditing: false,       // textarea copies render as a block, not in edit mode
      };

      // Deselect everything else; the new copy is the only selected element.
      return [...prevState.map(el => ({ ...el, isSelected: false })), copy];
    });
  }, []);

  const handleDeleteElement = useCallback((elementId) => {
    setA4_Elements(prevState => {
      const deletedElement = prevState.find(el => el.element_id === elementId);
      if (deletedElement) {
        setA4_Elements_deleted(prev =>
          prev.some(e => e.element_id === elementId && e.pdf_id !== undefined) 
          ? prev : [...prev, { ...deletedElement, deleted : true}]
        );
      }
      return prevState.filter(element => element.element_id !== elementId);
    });
  }, []);

  const handleEditElementValues = useCallback((dataObject, id) => {
    setA4_Elements(prevState => {
      const newState = prevState.map((element) => {
        if (element.element_id === id) {
          return { ...element, ...dataObject };
        } else {
          return element;
        }
      });
      return newState;
    });
  }, [])

  // Move an element to newTop and shift every element BELOW it (in absolute
  // document order) by the same delta — opens/closes vertical space above the
  // moved block while preserving spacing. Fully bidirectional: pushing down
  // flows overflow onto the next page (creating it), pushing up pulls elements
  // back from later pages and trims the now-empty trailing pages.
  const handleMoveElementWithBelow = useCallback((elementId, newTop) => {
    const PAGE_HEIGHT = 842;
    const elements = elementsRef.current;
    const target = elements.find(el => el.element_id === elementId);
    if (!target) return;

    // Work in absolute document Y (across all pages). This keeps the moved
    // block rigid as it flows across page boundaries — measuring per-page and
    // matching only the target's page collapses spacing the moment an element
    // crosses onto the next page.
    const absOf = (el) => ((el.page ?? 1) - 1) * PAGE_HEIGHT + el.top;
    const oldAbs = absOf(target);
    const newAbs = ((target.page ?? 1) - 1) * PAGE_HEIGHT + newTop;
    const delta = newAbs - oldAbs;
    if (delta === 0) return;

    // Absolute Y -> { page, top }. Only wraps downward overflow; upward moves
    // that pull an element to an earlier page resolve naturally too.
    const toPageTop = (abs) => {
      let a = abs;
      let p = 1;
      while (a >= PAGE_HEIGHT) { a -= PAGE_HEIGHT; p += 1; }
      return { page: p, top: a };
    };

    let maxPage = 1;
    const next = elements.map(el => {
      let res = el;
      if (el.element_id === elementId) {
        const { page, top } = toPageTop(newAbs);
        res = { ...el, page, top };
      } else if (absOf(el) > oldAbs) {
        // Every element below the target (in absolute terms) shifts by the
        // same delta — spacing preserved across the page break.
        const { page, top } = toPageTop(absOf(el) + delta);
        res = { ...el, page, top };
      }
      if ((res.page ?? 1) > maxPage) maxPage = res.page ?? 1;
      return res;
    });

    setA4_Elements(next);
    // Set the page count to the furthest page that actually holds an element:
    // grows as overflow flows down, shrinks when an upward push empties the
    // trailing pages the overflow created. Empty pages between content are kept
    // (maxPage tracks the highest OCCUPIED page). Clamp the view so it doesn't
    // sit on a page that no longer exists.
    setPageCount(maxPage);
    setCurrentPage(cp => Math.min(cp, maxPage));
  }, [])

  const handleAlignElements = useCallback((elementId, position, width, category) => {
    if (category === "text") {
      const widthText = document.getElementById(elementId).clientWidth;
      width = widthText;
    }
    if (position === "LEFT") {
      setA4_Elements(prevState => {
        const newState = prevState.map((element) => (
          element.element_id === elementId ? { ...element, left: 0 } : { ...element }
        ))
        return newState;
      })
    }
    else if (position === "CENTER") {
      setA4_Elements(prevState => {
        const newState = prevState.map((element) => {
          if (element.element_id === elementId) {
            return { ...element, left: (595 - width) / 2 };
          }
          else {
            return { ...element };
          }
        })
        return newState;
      })
    }
    else {
      setA4_Elements(prevState => {
        const newState = prevState.map((element) => {
          if (element.element_id === elementId) {
            return { ...element, left: 595 - width - 1 };
          }
          else {
            return { ...element };
          }
        })
        return newState;
      })
    }
  }, [])

  const PDFTitle = useCallback((title) => {
    setA4_Elements(prevState => {
      return [...prevState, { title }]
    });
  }, [])


  const handleResizeElement = useCallback((e, direction, category, elementId, elementRef) => {

    let aspectRatio = 1;
    let heightFactor;
    if (category === "image" && elementRef?.current) {
      aspectRatio = elementRef.current.naturalHeight / elementRef.current.naturalWidth;
    }

    const A4_COORDS = A4ref.current.getBoundingClientRect();

    const A4_WIDTH = 595;   
    const A4_HEIGHT = 842;  
    const MIN_WIDTH = 10;
    const MIN_HEIGHT = 10;

    setA4_Elements((prevState) => {
      const newState = prevState.map((element) => {
        // Text boxes resize freely: width follows horizontal drag, height
        // follows vertical drag (unlike lines, where height tracks movementX).
        if (category === "textarea") {
          if (element.element_id !== elementId) {
            return { ...element, isSelected: false };
          }
          let w = element.width;
          let h = element.height;
          let l = element.left;
          let t = element.top;
          const MIN_W = 40;
          const MIN_H = 24;
          if (direction === "bottom-right") { w += e.movementX; h += e.movementY; }
          else if (direction === "bottom-left") { w -= e.movementX; l += e.movementX; h += e.movementY; }
          else if (direction === "top-right") { w += e.movementX; h -= e.movementY; t += e.movementY; }
          else if (direction === "top-left") { w -= e.movementX; l += e.movementX; h -= e.movementY; t += e.movementY; }
          if (l < 0) { w += l; l = 0; }
          if (t < 0) { h += t; t = 0; }
          w = Math.max(MIN_W, Math.min(A4_WIDTH - l, w));
          h = Math.max(MIN_H, Math.min(A4_HEIGHT - t, h));
          return { ...element, width: w, height: h, left: l, top: t };
        }
        if (category === "image") {
          heightFactor = element.width
        } else {
          heightFactor = element.height
        }
        if (direction === "top-left") {
          if (element.element_id === elementId) {

            return {
              ...element,
              width: element.width - e.movementX,
              height: Math.round((heightFactor - e.movementX) * aspectRatio),
              left: element.left + e.movementX,
              top: element.top + (element.height - Math.round((heightFactor - e.movementX) * aspectRatio))
            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }
        if (direction === "bottom-right") {

          let newWidth = element.width + e.movementX;
          let newHeight = Math.round((heightFactor + e.movementX) * aspectRatio);
          let newLeft = element.left;
          let newTop = element.top;
          newWidth = Math.max(MIN_WIDTH, Math.min(A4_WIDTH - element.left, newWidth));
          newHeight = Math.max(MIN_HEIGHT, Math.min(A4_HEIGHT - element.top, newHeight));

          if (element.element_id === elementId) {
            return {
              ...element,
              width: newWidth,
              height: newHeight,
              left: newLeft,
              top: newTop
            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

        if (direction === "bottom-left") {
          if (element.element_id === elementId) {
            return {
              ...element,
              width: element.width - e.movementX,
              height: Math.round((heightFactor - e.movementX) * aspectRatio),
              left: element.left + e.movementX,

            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

        if (direction === "top-right") {
          if (element.element_id === elementId) {
            return {
              ...element,
              width: element.width + e.movementX,
              height: Math.round((heightFactor + e.movementX) * aspectRatio),
              left: element.left,
              top: element.top + (element.height - Math.round((heightFactor + e.movementX) * aspectRatio))
            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

        if (direction === "center-right") {
          if (element.element_id === elementId) {
            const proposedWidth = element.width + e.movementX;
            const newWidth = Math.max(MIN_WIDTH, Math.min(A4_WIDTH - element.left, proposedWidth))
            return {
              ...element,
              width: newWidth,
              left: element.left

            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

        if (direction === "center-left") {

          const rightEdge = element.left + element.width;
          const proposedLeft = element.left + e.movementX;
          const newLeft = Math.max(0, Math.min(rightEdge - MIN_WIDTH, proposedLeft));
          const newWidth = rightEdge - newLeft;

          if (element.element_id === elementId) {
            return {
              ...element,
              width: newWidth,
              left: newLeft
            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

      })
      return newState;
    })
  }, [])

  const handleClearA4 = useCallback(() => {
      setA4_Elements([]);
      setA4_Elements_deleted([]);
      setPageCount(1);
      setCurrentPage(1);
      titleRef.current.value = "";
  }, [])

  // Replace the canvas with a template (array of element specs). Each spec gets
  // a fresh id + page; interaction flags default off. Resets to a single page.
  // Load a template and overlay AI-generated content.
  // fills: [{id, content}] from POST /ai/fill_template
  // Load AI-generated elements directly (the backend already built the full layout).
  // Each spec gets a fresh nanoid; the page count is derived from the highest page value.
  const handleLoadAiElements = useCallback((specs, templateName) => {
    const mapped = (specs || []).map(spec => ({
      isSelected: false,
      isMove: false,
      isEditing: false,
      ...spec,
      element_id: nanoid(),
    }));
    const maxPage = mapped.reduce((m, el) => Math.max(m, el.page ?? 1), 1);
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setPageCount(maxPage);
    setCurrentPage(1);
    if (titleRef?.current && templateName) {
      titleRef.current.value = `${templateName} CV`;
    }
  }, [])

  const handleLoadTemplateWithFill = useCallback((templateElements, templateName, fills) => {
    // fills use array index as id (String) — match by position, not by element_id
    const fillMap = Object.fromEntries((fills || []).map(f => [f.id, f.content]));
    const mapped = templateElements.map((spec, i) => {
      const aiContent = fillMap[String(i)];
      const useAi = (spec.category === "text" || spec.category === "textarea")
        && aiContent !== undefined && aiContent !== "";
      return {
        isSelected: false,
        isMove: false,
        isEditing: false,
        ...spec,
        element_id: nanoid(),
        page: 1,
        content: useAi ? aiContent : spec.content,
      };
    });
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setPageCount(1);
    setCurrentPage(1);
    if (titleRef?.current && templateName) {
      titleRef.current.value = `${templateName} CV`;
    }
  }, [])

  const handleLoadTemplate = useCallback((templateElements, templateName) => {
    const mapped = templateElements.map((spec) => ({
      isSelected: false,
      isMove: false,
      isEditing: false,
      ...spec,
      element_id: nanoid(),
      page: 1,
    }));
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setPageCount(1);
    setCurrentPage(1);
    if (titleRef?.current && templateName) {
      titleRef.current.value = `${templateName} CV`;
    }
  }, [])


  return {
    A4_Elements,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
    handleMoveElement,
    handleSelectMoveElement,
    handleSelectElement,
    handleAddText,
    handleAddLine,
    handleAddImage,
    handleAddTextarea,
    markSelected,
    handleSetTextareaEditing,
    handleAlignElements,
    handleDeleteElement,
    handleDuplicateElement,
    handleEditElementValues,
    handleMoveElementWithBelow,
    A4ref,
    PDFTitle,
    handleResizeElement,
    handleClearA4,
    handleLoadTemplate,
    handleLoadTemplateWithFill,
    handleLoadAiElements,
    // multi-page
    pageCount,
    setPageCount,
    currentPage,
    setCurrentPage,
    addPage: handleAddPage,
    removePage: handleRemovePage,
    goToPage: handleGoToPage,
  };

}