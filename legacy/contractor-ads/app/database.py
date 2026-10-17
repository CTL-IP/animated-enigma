from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import DB_PATH

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema() -> None:
    """Add columns create_all will not add to an existing ads table."""
    with engine.begin() as conn:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(ads)"))}
        if "facebook_post_id" not in existing:
            conn.execute(text("ALTER TABLE ads ADD COLUMN facebook_post_id VARCHAR(128)"))
        if "facebook_post_url" not in existing:
            conn.execute(text("ALTER TABLE ads ADD COLUMN facebook_post_url VARCHAR(500)"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
