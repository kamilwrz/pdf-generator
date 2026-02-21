from sqlalchemy.orm import Session
from app.models.models import Pdf, PdfElements
from datetime import datetime, timezone
import datetime


def create_new_pdf(db:Session, title:str, user_id:int, file_path:str, elements:list):

    pdf_db = Pdf(
        title = title,
        file_path = file_path,
        owner_id = user_id,
        created_at = datetime.datetime.now(timezone.utc),
        updated_at = datetime.datetime.now(timezone.utc)
    )

    db.add(pdf_db)
    db.flush()

    for element in elements:
        pdf_elements_db = PdfElements(
            pdf_id = pdf_db.id,
            element_id = element.element_id,
            category = element.category,
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
            img_id = element.img_id,
            extra_properties = {"zIndex": element.zIndex, "isSelected" : element.isSelected, "isMove": element.isMove}
    )
        db.add(pdf_elements_db)
    
    db.commit()

    return pdf_db.id

def request_pdf_by_id(db:Session, pdf_id:int):
    return db.query(Pdf).filter(Pdf.id==pdf_id).first()

def request_pdfs_by_id(db:Session, user_id:int):
    return db.query(Pdf).filter(Pdf.owner_id==user_id).all()

def delete_pdf_by_id(db:Session, pdf_id:int):
    db.query(Pdf).filter(Pdf.id==pdf_id).delete()
    db.query(PdfElements).filter(PdfElements.pdf_id==pdf_id).delete()
    db.commit()

def request_pdf_by_id_show(db:Session, pdf_id: int):
    return db.query(PdfElements).filter(PdfElements.pdf_id==pdf_id).all()

def request_pdf_elements_by_element_id(db:Session, pdf_id:int):
    existing_by_id = { e.element_id: e
    for e in db.query(PdfElements).filter(PdfElements.pdf_id == pdf_id).all()}
    return existing_by_id

def update_pdf_elements(db:Session, elements:list, existing_elements:dict, pdf_id:int):

    print(elements)
    print(existing_elements)

    for element in elements:
        if element.element_id not in existing_elements:
            pdf_elements = PdfElements(
              pdf_id=pdf_id,
              element_id=element.element_id,
              category=element.category,
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
              img_id=element.img_id,
              extra_properties={"zIndex": element.zIndex, "isSelected": element.isSelected, "isMove": element.isMove},
            )
            db.add(pdf_elements)
       
        else:
            existing_row = existing_elements[element.element_id]
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
            existing_row.img_id = element.img_id
            existing_row.extra_properties = {"zIndex": element.zIndex, "isSelected": element.isSelected, "isMove": element.isMove}