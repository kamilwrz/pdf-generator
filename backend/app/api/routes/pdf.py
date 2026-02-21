from fastapi import APIRouter, Body, Depends, HTTPException
from starlette import status
from app.models.database import SessionLocal
from sqlalchemy.orm import Session
from app.services.pdf_generator import PDF_Generator
from reportlab.pdfgen import canvas
from app.core.config import PDF_UPLOAD_DIR, IMAGES_UPLOAD_DIR
from urllib.parse import unquote, urlparse
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.schemas.pdf_schema import PDFCreateRequest, PDFUpdateRequest

from os import listdir
from os.path import isfile, join

from app.crud.pdfs import create_new_pdf,request_pdf_by_id,delete_pdf_by_id, request_pdf_by_id_show, request_pdf_elements_by_element_id, update_pdf_elements, request_pdfs_by_id
from app.utils.delete_pdf_file import delete_pdf_file
from app.utils.rename_pdf_file import rename_pdf_file


def image_src_to_local_path(src: str) -> str:
    """Convert image src (URL or path) to a local absolute file path for ReportLab."""
    if not src:
        return src
    if src.startswith(("http://", "https://")):
        parsed = urlparse(src)
        path = parsed.path.lstrip("/").replace("\\", "/")
        if path.startswith("uploads/"):
            path = path[8:]
        decoded = unquote(path)
        local = (IMAGES_UPLOAD_DIR / decoded).resolve()
        return str(local)
    if "/uploads/" in src:
        path_part = src.split("/uploads/")[1]
        decoded = unquote(path_part)
        local = (IMAGES_UPLOAD_DIR / decoded).resolve()
        return str(local)
    return src

router = APIRouter(
    prefix="/pdf",
    tags=["pdf"]
)

def get_db():
    db = SessionLocal()  
    try:
        yield db  
    finally:
        db.close()  

@router.post("/create_pdf")
async def create_user_pdf(
    pdf_data : PDFCreateRequest,
    payload: dict = Depends(verify_token),
    db:Session = Depends(get_db)
    ):

    elements = pdf_data.root
    title = pdf_data.pdf_title

    if not elements:
        raise HTTPException(status_code=400, detail="Some data seems to be missing...")

    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)

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

    
    return {"message": "PDF created!", "link": f"https://pdf-generator-07cb.onrender.com/{pdf_path.as_posix()}", "pdf_id": pdf_id}


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
    delete_pdf_file(pdf_to_delete.file_path)

    return {"message": "PDF deleted", "name": pdf_to_delete.title, "id": pdf_to_delete.id}


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

    user_upload_dir = PDF_UPLOAD_DIR / db_user.username
    user_upload_dir.mkdir(parents=True, exist_ok=True)
    
    pdf_row = request_pdf_by_id(db, pdf_id)

    print(pdf_row.file_path, "FILE PATH PDF ROW")
    
    new_file_path = rename_pdf_file(pdf_row, title)
    db.add(pdf_row)

    existing_by_id = request_pdf_elements_by_element_id(db, pdf_id)
    update_pdf_elements(db, elements, existing_by_id, pdf_id)

    pdf = PDF_Generator(pdf_data, canvas.Canvas(new_file_path, pagesize=(595, 842)))
    pdf.setTitle(pdf_row.title or "untitled")

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
    db.commit()

    return {"message": "PDF update was successfull!"}








