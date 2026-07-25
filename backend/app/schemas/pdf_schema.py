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
    #TEXTAREA TEXT ALIGNMENT: left | center | right | justify
    align: Optional[str] = "left"
    #TEXTAREA HANGING INDENT FOR LINES STARTING WITH A BULLET (•)
    bulletList: Optional[bool] = False
    #TEXTAREA TEMPLATE FIELD: height follows rendered content and reflows layout
    autoHeight: Optional[bool] = False
    #PAGE DECORATION: remains anchored while auto-height content reflows
    fixedToPage: Optional[bool] = False
    #LINE / IMG ELEMENT
    width: Optional[float | str] = None
    height: Optional[float | str] = None
    #LINE ELEMENT / RECTANGLE ELEMENT (backgroundColor = fill for line, border colour for rectangle)
    backgroundColor: Optional[str] = None
    #RECTANGLE ELEMENT (outline only): border thickness in px
    borderWidth: Optional[float] = None
    #CONNECTOR ELEMENT: links two elements by their element_id, optional arrowhead
    source_id: Optional[str] = None
    target_id: Optional[str] = None
    arrow: Optional[bool] = False
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
    #PAGE GEOMETRY (pt): A4 portrait by default; decks send 960x540
    page_width: float = 595
    page_height: float = 842

class PDFUpdateRequest(BaseModel):
    pdf_id: int
    pdf_title: str
    root: list[PdfElement]
    pages: int = 1
    page_width: float = 595
    page_height: float = 842