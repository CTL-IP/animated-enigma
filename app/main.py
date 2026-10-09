from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routes.ads import router
import app.models  # noqa: F401

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ContractorAds")
app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(router)
