from typing import Optional
from pydantic import BaseModel

#PYDANTIC MODEL FOR CREATING A PDF VIA POST REQUEST
class PdfElement(BaseModel):
    #ELEMENT CATEGORY
    category: Optional[str] = None
    #PAGE THE ELEMENT BELONGS TO (1-based)
    page: Optional[int] = 1
    #ELEMENT POSITION
    left: Optional[float] = None
    top: Optional[float] = None
    #TEXT ELEMENT
    fontFamily: Optional[str] = None
    fontSize: Optional[float] = None
    color: Optional[str] = None
    content: Optional[str] = None
    #TEXTAREA ELEMENT (multi-line text box)
    lineHeight: Optional[float] = None
    letterSpacing: Optional[float] = None
    #TEXT STYLE TOGGLES (text + textarea)
    bold: Optional[bool] = False
    italic: Optional[bool] = False
    underline: Optional[bool] = False
    #LINE / IMG ELEMENT
    width: Optional[float | str] = None
    height: Optional[float | str] = None
    #LINE ELEMENT
    backgroundColor: Optional[str] = None
    #IMG ELEMENT
    src: Optional[str] = None
    #NANO ID
    element_id : Optional[str] = None
    #PDF TITLE
    title: Optional[str] = None
    #
    pdf_id: Optional[int] = None
    #EXTRA PROPERTIES exp. zIndex, isSelected etc.
    zIndex: Optional[int] = None
    isSelected : Optional[bool] = None
    isMove: Optional[bool] = None
    #
    img_id : Optional[int] = None
    deleted: Optional[bool] = None

class PDFCreateRequest(BaseModel):
    root: list[PdfElement]
    pdf_title: str
    pages: int = 1

class PDFUpdateRequest(BaseModel):
    pdf_id: int
    pdf_title: str
    root: list[PdfElement]
    pages: int = 1