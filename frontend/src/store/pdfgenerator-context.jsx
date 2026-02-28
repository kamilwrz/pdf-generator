import { createContext } from "react";

//create the context value
// value that is produced by createContext() will be an object that contains a React component
// export = providing context to the APP, then wrap components (PdfGenerator Page) with PdfContext 

export const PdfContext = createContext({
    A4_Elements : [],
    addImage: () => {},
    addText: () => {},
    addLine: () => {},
    selectElement: () => {},
    moveElement: () => {},
    selectMoveElement: () => {},
    isGallery: false,
    isDropzone: false,
    createPdf: () => {},
    showDropzone:() => {},
    showGallery: () => {},
    editElementValues: () => {},
    alignElement: () => {},
    deleteElement: () => {},
    setA4_Elements: () => {},
    valueImageUpload: 0,
    setValueImageUpload: () => {},
    addTitle: () => {},
    isVisibleModal: false,
    setIsModalPdfs: () => {},
    resizeElement: () => {},
    updatePdf: () => {},
    handlePdfId: () => {},
    handleSetTitle: () => {},
    title: undefined,
    clearA4modalDelete: () => {},
    clearA4: () => {},
    showModalRequest: () => {},
    logout: () => {},
    isPdfLoading: false,
    setA4_Elements_deleted: () =>{},
    setPDFdownloadData: () => {},
    PDFdownloadData: []
})