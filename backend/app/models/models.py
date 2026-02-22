from sqlalchemy import VARCHAR, Boolean, Column, DateTime, Integer, Float, String, ForeignKey, Text, JSON
from .database import Base, engine

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    created_at = Column(DateTime)
    is_active = Column (Boolean)

User.metadata.create_all(bind=engine)

class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_path = Column(String)
    file_size = Column(Integer)
    mime_type = Column(String)
    uploaded_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))

Image.metadata.create_all(bind=engine)

class Pdf(Base):
    __tablename__ = "pdfs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column (String)
    file_path = Column (String, nullable=True)
    created_at = Column (DateTime)
    updated_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))

Pdf.metadata.create_all(bind=engine)

class PdfElements(Base):
    __tablename__ = "pdf_elements"

    id = Column(Integer, primary_key=True, index=True)
    pdf_id = Column(Integer, ForeignKey("pdfs.id"))
    img_id = Column(Integer, ForeignKey("images.id"), nullable=True)
    element_id = Column(String)
    category = Column(String)
    left = Column(Float)
    top = Column(Float)
    width = Column(VARCHAR, nullable=True)
    height = Column(VARCHAR, nullable=True)
    content = Column (Text, nullable=True)
    fontSize = Column(Float, nullable=True)
    fontFamily = Column(String, nullable=True)
    color = Column (String, nullable=True)
    src = Column(String, nullable=True)
    backgroundColor = Column(String, nullable=True)
    extra_properties = Column(JSON, nullable=True)

PdfElements.metadata.create_all(bind=engine)

