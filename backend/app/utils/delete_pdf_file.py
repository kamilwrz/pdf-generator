import os

def delete_pdf_file(file_path):
    try:
        os.remove(file_path)
    except:
        return {"message": f"File '{file_path}' not found."}
