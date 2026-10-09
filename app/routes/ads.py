import base64
import json
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Ad

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

UPLOAD_DIR = Path("static/uploads")
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MEDIA_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

CONTRACTOR_TYPES = [
    "General Contractor",
    "Roofing",
    "Plumbing",
    "Electrical",
    "HVAC",
    "Flooring",
    "Painting",
    "Landscaping",
    "Concrete",
    "Remodeling",
    "Framing",
    "Insulation",
    "Drywall",
    "Masonry",
]
PLATFORMS = ["Facebook", "Google", "Instagram", "Nextdoor", "Craigslist"]
STATUSES = ["draft", "published"]


def blank(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def get_ad(db: Session, ad_id: int) -> Ad:
    ad = db.get(Ad, ad_id)
    if ad is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    return ad


def save_image(upload: UploadFile | None) -> str | None:
    if upload is None or not upload.filename:
        return None
    if upload.content_type not in ALLOWED_TYPES:
        return None
    suffix = Path(upload.filename).suffix.lower()
    if suffix not in MEDIA_BY_SUFFIX:
        suffix = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }[upload.content_type]
    name = f"{uuid.uuid4().hex}{suffix}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / name).write_bytes(upload.file.read())
    return f"static/uploads/{name}"


def delete_image(path: str | None) -> None:
    if not path:
        return
    file = Path(path)
    if file.is_file():
        file.unlink()


def generate_ad_copy(ad: Ad) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not set.")

    import anthropic

    prompt = (
        "You are a direct-response copywriter for local contractors. "
        "Write one ad for the platform named below.\n"
        f"Business name: {ad.business_name}\n"
        f"Contractor type: {ad.contractor_type}\n"
        f"Services: {ad.services}\n"
        f"Location: {ad.location}\n"
        f"Tagline: {ad.tagline or ''}\n"
        f"Phone: {ad.phone or ''}\n"
        f"Website: {ad.website or ''}\n"
        f"Platform: {ad.platform}\n"
    )
    content: list[dict] = []
    if ad.image_path:
        image = Path(ad.image_path)
        media = MEDIA_BY_SUFFIX.get(image.suffix.lower())
        if image.is_file() and media:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media,
                        "data": base64.standard_b64encode(image.read_bytes()).decode(),
                    },
                }
            )
            prompt += "Use specific visual details from the attached photo of the work.\n"
    prompt += 'Return only a JSON object: {"headline": "...", "body": "...", "cta": "..."}'
    content.append({"type": "text", "text": prompt})

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": content}],
    )
    text = message.content[0].text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


@router.get("/")
def list_ads(request: Request, db: Session = Depends(get_db)):
    ads = db.query(Ad).order_by(Ad.created_at.desc(), Ad.id.desc()).all()
    return templates.TemplateResponse(request, "index.html", {"ads": ads})


@router.get("/ads/new")
def new_ad_form(request: Request):
    return templates.TemplateResponse(
        request,
        "create.html",
        {"contractor_types": CONTRACTOR_TYPES, "platforms": PLATFORMS},
    )


@router.post("/ads/new")
def create_ad(
    business_name: str = Form(...),
    contractor_type: str = Form(...),
    services: str = Form(...),
    location: str = Form(...),
    phone: str = Form(""),
    website: str = Form(""),
    tagline: str = Form(""),
    platform: str = Form("facebook"),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    ad = Ad(
        business_name=business_name.strip(),
        contractor_type=contractor_type.strip(),
        services=services.strip(),
        location=location.strip(),
        phone=blank(phone),
        website=blank(website),
        tagline=blank(tagline),
        platform=(platform or "facebook").strip().lower(),
        status="draft",
        image_path=save_image(image),
    )
    db.add(ad)
    db.commit()
    db.refresh(ad)
    return RedirectResponse(url=f"/ads/{ad.id}", status_code=303)


@router.get("/ads/{ad_id}")
def view_ad(ad_id: int, request: Request, db: Session = Depends(get_db)):
    ad = get_ad(db, ad_id)
    return templates.TemplateResponse(request, "view.html", {"ad": ad})


@router.get("/ads/{ad_id}/edit")
def edit_ad_form(ad_id: int, request: Request, db: Session = Depends(get_db)):
    ad = get_ad(db, ad_id)
    statuses = list(STATUSES)
    if ad.status and ad.status not in statuses:
        statuses.append(ad.status)
    return templates.TemplateResponse(
        request,
        "edit.html",
        {
            "ad": ad,
            "contractor_types": CONTRACTOR_TYPES,
            "platforms": PLATFORMS,
            "statuses": statuses,
        },
    )


@router.post("/ads/{ad_id}/edit")
def update_ad(
    ad_id: int,
    business_name: str = Form(...),
    contractor_type: str = Form(...),
    services: str = Form(...),
    location: str = Form(...),
    phone: str = Form(""),
    website: str = Form(""),
    tagline: str = Form(""),
    platform: str = Form("facebook"),
    ad_headline: str = Form(""),
    ad_body: str = Form(""),
    ad_cta: str = Form(""),
    status: str = Form("draft"),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    ad = get_ad(db, ad_id)
    ad.business_name = business_name.strip()
    ad.contractor_type = contractor_type.strip()
    ad.services = services.strip()
    ad.location = location.strip()
    ad.phone = blank(phone)
    ad.website = blank(website)
    ad.tagline = blank(tagline)
    ad.platform = (platform or "facebook").strip().lower()
    ad.ad_headline = blank(ad_headline)
    ad.ad_body = blank(ad_body)
    ad.ad_cta = blank(ad_cta)
    ad.status = (status or "draft").strip() or "draft"
    replacement = save_image(image)
    if replacement:
        delete_image(ad.image_path)
        ad.image_path = replacement
    db.commit()
    return RedirectResponse(url=f"/ads/{ad.id}", status_code=303)


@router.post("/ads/{ad_id}/generate")
def generate(ad_id: int, db: Session = Depends(get_db)):
    ad = get_ad(db, ad_id)
    copy = generate_ad_copy(ad)
    ad.ad_headline = copy.get("headline")
    ad.ad_body = copy.get("body")
    ad.ad_cta = copy.get("cta")
    db.commit()
    return RedirectResponse(url=f"/ads/{ad.id}", status_code=303)
