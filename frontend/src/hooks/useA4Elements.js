import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';

export function useA4Elements(titleRef) {

  const A4ref = useRef(null);

  const [A4_Elements, setA4_Elements] = useState([]);
  const [A4_Elements_deleted, setA4_Elements_deleted] = useState([]);

  useEffect(() => {
    changeWidthHeightInState()
  }, [A4_Elements?.length ?? 0])

  function changeWidthHeightInState() {
    if (!A4ref.current) return;

    const A4 = A4ref.current;
    const EL_HEIGHT_WIDTH = [];
    for (let el of Array.from(A4.children)) {
      if (el.tagName === "P") {
        EL_HEIGHT_WIDTH.push([el.id, "auto", "auto"])
      } else {
        EL_HEIGHT_WIDTH.push([el.id, el.clientHeight, el.clientWidth])
      }
    };
    setA4_Elements(prevState => {
      const newState = prevState.map((element, id) => {
        if (!element.element_id || element.category === "title") return { ...element }
        else if (EL_HEIGHT_WIDTH[id] && element.element_id === EL_HEIGHT_WIDTH[id][0]) {
          return { ...element, height: EL_HEIGHT_WIDTH[id][1], width: EL_HEIGHT_WIDTH[id][2] }
        }
        else {
          return { ...element }
        }
      });
      return newState;
    })
  }

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
          return elementId === element.element_id && element.isMove === true ? { ...element, left: newPositionLeft, top: newPositionTop } : element
        });
        return newState;
      });
    }
  }, [])

  const handleSelectMoveElement = useCallback((elementId) => {
    setA4_Elements(prevState => {
      const newState = prevState.map((element) => (
        element.element_id === elementId ? { ...element, isMove: !element.isMove }
          : { ...element, isMove: false }
      ));
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
      fontFamily: "Times-Roman",
      color: "#000000",
      left: 10,
      top: 10,
      isSelected: false,
      isMove: false,
      category: "text",
      width: "auto",
      height: "auto",
      zIndex: 3,
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
      zIndex: 2
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
      height: "auto",
      left: 10,
      top: 10,
      isSelected: false,
      isMove: false,
      category: "image",
      zIndex: 1,
      img_id : e.target.id
    };
    setA4_Elements(prevState => {
      return [...prevState, image];
    });
  }, [])

  ///??? 
  const handleDeleteElement = useCallback((elementId) => {
    setA4_Elements(prevState => {
      const deletedElement = prevState.find(el => el.element_id === elementId);
      if (deletedElement) {
        setA4_Elements_deleted(prev =>
          prev.some(e => e.element_id === elementId && e.pdf_id !== undefined) 
          ? prev : [...prev, { ...deletedElement, deleted: true }]
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
              //isSelected: false
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
      titleRef.current.value = "";
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
    changeWidthHeightInState,
    handleAlignElements,
    handleDeleteElement,
    handleEditElementValues,
    A4ref,
    PDFTitle,
    handleResizeElement,
    handleClearA4
  };

}