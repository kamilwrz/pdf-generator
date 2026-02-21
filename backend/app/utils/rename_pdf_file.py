import os
from app.core.config import PDF_UPLOAD_DIR

def rename_pdf_file(pdf:object, title: str):
    pdf_file_path = str(pdf.file_path)

    print(pdf_file_path, "RENAME")
    new_file_path = pdf_file_path.split("/")
    new_file_path[-1] = title

    print(new_file_path, "NEW FIEL APTH AFTER TITLE CHANGE")
    os.rename(pdf_file_path, "/".join(new_file_path))

    pdf.title = title
    pdf.file_path = "/".join(new_file_path)

    print(pdf.file_path, "ROW FILE PATH AFTER CHANGING")

    return "/".join(new_file_path)