import os

def rename_pdf_file(pdf:object, title: str):
    pdf_file_path = pdf.file_path

    new_file_path = pdf_file_path.split("\\")
    new_file_path[-1] = title

    os.rename(pdf_file_path, "\\".join(new_file_path))

    pdf.title = title
    pdf.file_path = "\\".join(new_file_path)

    return "\\".join(new_file_path)