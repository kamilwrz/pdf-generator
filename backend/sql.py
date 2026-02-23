# run_migrate_pdf_elements_columns.py
import os
from sqlalchemy import create_engine, text

# Use the same DATABASE_URL as your app (e.g. from env or .env)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://pdf_generator_db_i29i_user:rJ3GSIAnDaeOJjwhO1RmumD3r7kv2Axw@dpg-d6d18k5m5p6s73d5rpug-a/pdf_generator_db_i29i",
)

def main():
    engine = create_engine(DATABASE_URL)
    sql = """
     ALTER TABLE pdf_elements
       ALTER COLUMN width  TYPE VARCHAR USING width::TEXT,
       ALTER COLUMN height TYPE VARCHAR USING height::TEXT;
    """
    with engine.connect() as conn:
     result = conn.execute(text(sql))
     rows = result.fetchall()
     for row in rows:
        print(row)  
    

if __name__ == "__main__":
    main()