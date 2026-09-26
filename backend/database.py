import os
import shutil
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Locate database in the backend directory, or temp directory in Vercel serverless environment
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = DATABASE_URL
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
else:
    # On Vercel serverless functions, the root filesystem is read-only.
    # Writable SQLite database must reside in the system temporary directory.
    if os.environ.get("VERCEL"):
        temp_dir = tempfile.gettempdir()
        DB_PATH = os.path.join(temp_dir, "areca_farm.db")
        local_db = os.path.join(BASE_DIR, "areca_farm.db")
        if not os.path.exists(DB_PATH) and os.path.exists(local_db):
            try:
                shutil.copy2(local_db, DB_PATH)
            except Exception as e:
                print(f"[DB] Notice: Could not copy bundled DB to temp: {e}")
    else:
        DB_PATH = os.path.join(BASE_DIR, "areca_farm.db")

    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False}  # Needed for SQLite in multi-threaded FastAPI
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
