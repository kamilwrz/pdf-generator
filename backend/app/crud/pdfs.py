from sqlalchemy.orm import Session
from app.models.models import Pdf, PdfElements
from datetime import datetime, timezone
import datetime
from app.crud.images import request_image_by_id


def create_new_pdf(db:Session, title:str, user_id:int, file_path:str, elements:list, pages:int = 1, page_width:float = 595, page_height:float = 842):

    pdf_db = Pdf(
        title = title,
        file_path = file_path,
        owner_id = user_id,
        pages = pages or 1,
        page_width = page_width or 595,
        page_height = page_height or 842,
        created_at = datetime.datetime.now(timezone.utc),
        updated_at = datetime.datetime.now(timezone.utc)
    )


    db.add(pdf_db)
    db.flush()

    for element in elements:

        img_id = element.img_id
        if element.img_id is not None and not request_image_by_id(db, element.img_id):
            img_id = None

        pdf_elements_db = PdfElements(
            pdf_id = pdf_db.id,
            element_id = element.element_id,
            category = element.category,
            page = getattr(element, "page", 1) or 1,
            left = element.left,
            top = element.top,
            width = element.width,
            height = element.height,
            content = element.content,
            fontSize = element.fontSize,
            fontFamily = element.fontFamily,
            color = element.color,
            src = element.src,
            backgroundColor = element.backgroundColor,
            img_id = img_id,
            extra_properties = {"zIndex": element.zIndex, "isSelected" : element.isSelected, "isMove": element.isMove, "lineHeight": element.lineHeight, "letterSpacing": element.letterSpacing, "bold": element.bold, "italic": element.italic, "underline": element.underline, "align": element.align, "bulletList": element.bulletList, "autoHeight": element.autoHeight, "fixedToPage": element.fixedToPage, "locked": getattr(element, "locked", False), "borderWidth": element.borderWidth, "filled": getattr(element, "filled", False), "source_id": element.source_id, "target_id": element.target_id, "arrow": element.arrow}
    )
        db.add(pdf_elements_db)
    
    db.commit()

    return pdf_db.id

def request_pdf_by_id(db:Session, pdf_id:int):
    return db.query(Pdf).filter(Pdf.id==pdf_id).first()

def request_pdfs_by_id(db:Session, user_id:int):
    return db.query(Pdf).filter(Pdf.owner_id==user_id).all()

def delete_pdf_by_id(db:Session, pdf_id:int):
    db.query(PdfElements).filter(PdfElements.pdf_id == pdf_id).delete()
    db.query(Pdf).filter(Pdf.id == pdf_id).delete()
    db.commit()

def request_pdf_by_id_show(db:Session, pdf_id: int):
    return db.query(PdfElements).filter(PdfElements.pdf_id==pdf_id).all()

def request_pdf_elements_by_element_id(db:Session, pdf_id:int):
    existing_by_id = { e.element_id: e
    for e in db.query(PdfElements).filter(PdfElements.pdf_id == pdf_id).all()}
    return existing_by_id

def update_pdf_elements(db:Session, elements:list, existing_elements:dict, pdf_id:int):

    # The incoming LIVE elements are the authoritative set for this PDF. Anything
    # in the DB that is not among them (elements the client dropped, e.g. after
    # loading a different template, or ones flagged deleted) must be removed —
    # otherwise every save appends and the document accumulates stale rows.
    incoming_live = {
        el.element_id: el for el in elements
        if getattr(el, "deleted", False) != True and el.element_id is not None
    }
    for eid in list(existing_elements.keys()):
        if eid not in incoming_live:
            db.query(PdfElements).filter(
                PdfElements.pdf_id == pdf_id, PdfElements.element_id == eid
            ).delete()

    for element in incoming_live.values():

        img_id = element.img_id
        if element.img_id is not None and not request_image_by_id(db, element.img_id):
            img_id = None

        if element.element_id not in existing_elements:
            pdf_elements = PdfElements(
              pdf_id=pdf_id,
              element_id=element.element_id,
              category=element.category,
              page=getattr(element, "page", 1) or 1,
              left=element.left,
              top=element.top,
              width=element.width,
              height=element.height,
              content=element.content,
              fontSize=element.fontSize,
              fontFamily=element.fontFamily,
              color=element.color,
              src=element.src,
              backgroundColor=element.backgroundColor,
              img_id=img_id,
              extra_properties={"zIndex": element.zIndex, "isSelected": element.isSelected, "isMove": element.isMove, "lineHeight": element.lineHeight, "letterSpacing": element.letterSpacing, "bold": element.bold, "italic": element.italic, "underline": element.underline, "align": element.align, "bulletList": element.bulletList, "autoHeight": element.autoHeight, "fixedToPage": element.fixedToPage, "locked": getattr(element, "locked", False), "borderWidth": element.borderWidth, "filled": getattr(element, "filled", False), "source_id": element.source_id, "target_id": element.target_id, "arrow": element.arrow},
            )
            db.add(pdf_elements)

        else:
            existing_row = existing_elements[element.element_id]
            existing_row.page = getattr(element, "page", 1) or 1
            existing_row.left = element.left
            existing_row.top = element.top
            existing_row.width = element.width
            existing_row.height = element.height
            existing_row.content = element.content
            existing_row.fontSize = element.fontSize
            existing_row.fontFamily = element.fontFamily
            existing_row.color = element.color
            existing_row.src = element.src
            existing_row.backgroundColor = element.backgroundColor
            existing_row.img_id = img_id
            existing_row.extra_properties = {"zIndex": element.zIndex, "isSelected": element.isSelected, "isMove": element.isMove, "lineHeight": element.lineHeight, "letterSpacing": element.letterSpacing, "bold": element.bold, "italic": element.italic, "underline": element.underline, "align": element.align, "bulletList": element.bulletList, "autoHeight": element.autoHeight, "fixedToPage": element.fixedToPage, "locked": getattr(element, "locked", False), "borderWidth": element.borderWidth, "filled": getattr(element, "filled", False), "source_id": element.source_id, "target_id": element.target_id, "arrow": element.arrow}