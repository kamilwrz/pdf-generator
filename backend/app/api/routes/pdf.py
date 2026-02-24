from fastapi import APIRouter, Body, Depends, HTTPException
from starlette import status
from sqlalchemy.orm import Session
from app.services.pdf_generator import PDF_Generator
from reportlab.pdfgen import canvas
from app.core.config import PDF_UPLOAD_DIR
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.schemas.pdf_schema import PDFCreateRequest, PDFUpdateRequest
from app.dependencies import get_db

from os import listdir
from os.path import isfile, join

from app.crud.pdfs import (
    create_new_pdf,request_pdf_by_id,delete_pdf_by_id, request_pdf_by_id_show, 
    request_pdf_elements_by_element_id, update_pdf_elements, request_pdfs_by_id
    )

from app.utils.pdf_file_ops import delete_pdf_file, rename_pdf_file
from app.utils.build_pdf import build_pdf_to_buffer
from app.utils.image_src_to_path import image_src_to_local_path

from app.core.config import USE_S3

if USE_S3:
    from app.services import s3_storage


router = APIRouter(
    prefix="/pdf",
    tags=["pdf"]
)

@router.post("/create_pdf")
async def create_user_pdf(
    pdf_data : PDFCreateRequest,
    payload: dict = Depends(verify_token),
    db:Session = Depends(get_db)
    ):

    #PDF ELEMENTS PASSED VIA POST REQUEST FROM THE FRONTEND (A4_Elements React STATE)
    elements = pdf_data.root
    #PDF TITLE PASSED VIA REF VALUE FROM THE FRONTEND (titleRef)
    """ BOTH USE A PYDANTIC SCHEMA (BASE MODEL) FOR VALIDATION """
    title = pdf_data.pdf_title

    #WHEN NO ELEMENTS IN THE CANVAS / STATE THROW HTTPException
    if not elements:
        raise HTTPException(status_code=400, detail="Some data seems to be missing...")
    
    #GET THE USERNAME FROM THE JWT TOKEN / CURRENT SESSION
    username = payload.get("sub")
    #GET THE TABLE ROW WITH THE RIGHT USER
    db_user = get_user_by_username(db, username=username)

    #WITHOUT load_dotenv() USE_S3 is True, when in the host(render) enviorment the variable is set. Otherwise it wont read from the .env file
    #CODE IS DEPLOYED ON RENDER -> VAR. IS SET USE_S3 WILL BE TRUE, SO THE "PROCESS" GOES OVER AWS S3_BUCKET
    if USE_S3:
        key = f"pdfs/{username}/{title}"
        try:
            paginator = s3_storage.get_client().get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=s3_storage.S3_BUCKET, Prefix=f"pdfs/{username}/"):
                for obj in page.get("Contents", []):
                    if obj["Key"] == key:
                        raise HTTPException(status_code=400, detail="File name already exists!")
        except HTTPException:
            raise
        except Exception:
            pass
        pdf_bytes = build_pdf_to_buffer(pdf_data, elements, image_src_to_local_path)
        file_path = s3_storage.upload_bytes(key, pdf_bytes, content_type="application/pdf")
        pdf_id = create_new_pdf(db, title, db_user.id, file_path, elements)
        return {"created": "PDF created!", "link": file_path, "pdf_id": pdf_id}
    
    else:
        user_upload_dir = PDF_UPLOAD_DIR / username
        user_upload_dir.mkdir(parents=True, exist_ok=True)
    
        files_in_user_folder = [f for f in listdir(user_upload_dir) if isfile(join(user_upload_dir, f))]
        if title in files_in_user_folder:
            raise HTTPException(status_code=400, detail="File name already exists!")

        pdf_path = user_upload_dir / title

        pdf_id = create_new_pdf(db, title, db_user.id, pdf_path.as_posix(), elements)

        pdf = PDF_Generator(pdf_data, canvas.Canvas(str(user_upload_dir / title), pagesize=(595, 842)))
        pdf.setTitle(title)
    
        for element in elements:
            category = element.category
        
            if category == "text":
                pdf.renderText(element.left, element.top, element.fontFamily, element.fontSize, element.color, element.content)
            if category == "line":
                pdf.renderLine(float(element.width), float(element.height), element.left, element.top, element.backgroundColor)
            if category == "image":
                src = image_src_to_local_path(element.src or "")
                pdf.renderImage(src, float(element.width), float(element.height), element.left, element.top)

        pdf.generatePDF()

    
        return {"created": "PDF created!", "link": f"https://pdf-generator-07cb.onrender.com/{pdf_path.as_posix()}", "pdf_id": pdf_id}


@router.get("/fetch_pdfs", status_code=status.HTTP_200_OK)
async def fetch_user_pdfs(
    payload: dict = Depends(verify_token),
    db:Session = Depends(get_db)
    ):

    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)

    pdfs = request_pdfs_by_id(db, db_user.id)

    if not pdfs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Please create a PDF, so it is available for preview and editing.",
        )
    return pdfs

@router.post("/show_pdf", status_code=status.HTTP_200_OK)
async def show_user_pdf(
    db:Session = Depends(get_db),
    payload: dict = Depends(verify_token),
    pdf_id = Body()
    ):

    pdf_to_show = request_pdf_by_id_show(db, pdf_id)

    if not pdf_to_show:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not found.",
        )
    return pdf_to_show


@router.delete("/delete_pdf", status_code=status.HTTP_202_ACCEPTED)
async def delete_user_pdf(
    db:Session = Depends(get_db),
    payload: dict = Depends(verify_token),
    pdf_id = Body()
    ):

    pdf_to_delete = request_pdf_by_id(db, pdf_id)
    if pdf_to_delete is None:
        raise HTTPException(status_code=404, detail='PDF not found.')
    
    delete_pdf_by_id(db, pdf_id)
    if USE_S3:
        key = s3_storage.key_from_file_path(pdf_to_delete.file_path)
        if key:
            try:
                s3_storage.delete_object(key)
            except Exception:
                pass
    else:
        delete_pdf_file(pdf_to_delete.file_path)
    return {"deleted": "PDF deleted", "name": pdf_to_delete.title, "id": pdf_to_delete.id}



@router.put("/update_pdf", status_code=status.HTTP_201_CREATED)
async def update_user_pdf(
    pdf_data : PDFUpdateRequest,
    db:Session = Depends(get_db),
    payload: dict = Depends(verify_token)):

    elements = pdf_data.root
    pdf_id = pdf_data.pdf_id
    title = pdf_data.pdf_title

    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)

    pdf_row = request_pdf_by_id(db, pdf_id)
    if not pdf_row:
        raise HTTPException(status_code=404, detail="PDF not found.")

    if USE_S3:
        key = f"pdfs/{username}/{title}"
        pdf_bytes = build_pdf_to_buffer(pdf_data, elements, image_src_to_local_path)
        s3_storage.upload_bytes(key, pdf_bytes, content_type="application/pdf")
        pdf_row.title = title
        pdf_row.file_path = f"https://{s3_storage.S3_BUCKET}.s3.{s3_storage.AWS_REGION}.amazonaws.com/{key}"
        link = pdf_row.file_path
        existing_by_id = request_pdf_elements_by_element_id(db, pdf_id)
        update_pdf_elements(db, elements, existing_by_id, pdf_id)
        db.commit()
        return {"updated": "PDF update was successful!", "link": link}

    else:
        new_file_path = rename_pdf_file(pdf_row, title)
        db.add(pdf_row)
        existing_by_id = request_pdf_elements_by_element_id(db, pdf_id)
        update_pdf_elements(db, elements, existing_by_id, pdf_id)
        c = canvas.Canvas(new_file_path, pagesize=(595, 842))
        pdf = PDF_Generator(pdf_data, c)
        pdf.setTitle(pdf_row.title or "untitled")
        for element in elements:
            if element.category == "text" and getattr(element, "deleted", None) != True:
                pdf.renderText(element.left, element.top, element.fontFamily, element.fontSize, element.color, element.content)
            elif element.category == "line" and getattr(element, "deleted", None) != True:
                pdf.renderLine(float(element.width), float(element.height), element.left, element.top, element.backgroundColor)
            elif element.category == "image" and getattr(element, "deleted", None) != True:
                src = image_src_to_local_path(element.src or "")
                pdf.renderImage(src, float(element.width), float(element.height), element.left, element.top)
        pdf.generatePDF()
        db.commit()
        return {"updated": "PDF update was successful!", "link": new_file_path}








