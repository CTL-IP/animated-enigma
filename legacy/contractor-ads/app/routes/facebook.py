import os
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from ..config import TEMPLATES_DIR, resolve_media
from ..database import get_db
from ..facebook_api import (
    GraphError,
    exchange_code,
    list_pages,
    oauth_dialog_url,
    page_message,
    permalink,
    publish_post,
)
from ..models import Ad, FacebookChoice, FacebookPage, OAuthState

router = APIRouter()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def meta_config() -> tuple[str, str, str] | None:
    app_id = (os.environ.get("META_APP_ID") or "").strip()
    app_secret = (os.environ.get("META_APP_SECRET") or "").strip()
    redirect_uri = (os.environ.get("META_REDIRECT_URI") or "http://127.0.0.1:8000/facebook/callback").strip()
    if not app_id or not app_secret:
        return None
    return app_id, app_secret, redirect_uri


def current_page(db: Session) -> FacebookPage | None:
    return db.query(FacebookPage).order_by(FacebookPage.id.desc()).first()


@router.get("/facebook", response_class=HTMLResponse)
async def facebook_home(
    request: Request,
    notice: str | None = None,
    detail: str | None = None,
    db: Session = Depends(get_db),
):
    page = current_page(db)
    return templates.TemplateResponse(
        request,
        "facebook.html",
        context={
            "configured": meta_config() is not None,
            "redirect_uri": (os.environ.get("META_REDIRECT_URI") or "http://127.0.0.1:8000/facebook/callback").strip(),
            "page": page,
            "notice": notice,
            "detail": (detail or "")[:300],
        },
    )


@router.get("/facebook/connect")
async def facebook_connect(db: Session = Depends(get_db)):
    config = meta_config()
    if config is None:
        return RedirectResponse("/facebook?notice=needs_app", status_code=303)
    app_id, _secret, redirect_uri = config
    state = secrets.token_urlsafe(24)
    db.add(OAuthState(state=state))
    db.commit()
    return RedirectResponse(oauth_dialog_url(app_id, redirect_uri, state), status_code=303)


@router.get("/facebook/callback", response_class=HTMLResponse)
async def facebook_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):
    if error_description:
        return RedirectResponse(
            "/facebook?" + urlencode({"notice": "denied", "detail": error_description[:240]}),
            status_code=303,
        )
    config = meta_config()
    saved = db.get(OAuthState, state) if state else None
    if saved:
        db.delete(saved)
        db.commit()
    if config is None or not code or not saved:
        return RedirectResponse("/facebook?notice=denied", status_code=303)

    app_id, app_secret, redirect_uri = config
    try:
        user_token = exchange_code(app_id, app_secret, redirect_uri, code)
        pages = list_pages(user_token)
    except GraphError as exc:
        return RedirectResponse(
            "/facebook?" + urlencode({"notice": "denied", "detail": str(exc)}),
            status_code=303,
        )

    if not pages:
        return RedirectResponse("/facebook?notice=no_pages", status_code=303)
    if len(pages) == 1:
        _save_page(db, pages[0])
        return RedirectResponse("/facebook?notice=connected", status_code=303)

    db.query(FacebookChoice).delete()
    for page in pages:
        db.add(
            FacebookChoice(
                page_id=page["id"],
                page_name=page["name"],
                access_token=page["access_token"],
            )
        )
    db.commit()
    return templates.TemplateResponse(
        request,
        "facebook_pages.html",
        context={"pages": db.query(FacebookChoice).order_by(FacebookChoice.page_name).all()},
    )


@router.post("/facebook/select")
async def facebook_select(page_id: str = Form(...), db: Session = Depends(get_db)):
    choice = db.get(FacebookChoice, page_id)
    if choice is None:
        return RedirectResponse("/facebook?notice=denied", status_code=303)
    _save_page(db, {"id": choice.page_id, "name": choice.page_name, "access_token": choice.access_token})
    db.query(FacebookChoice).delete()
    db.commit()
    return RedirectResponse("/facebook?notice=connected", status_code=303)


@router.post("/facebook/disconnect")
async def facebook_disconnect(db: Session = Depends(get_db)):
    db.query(FacebookPage).delete()
    db.query(FacebookChoice).delete()
    db.commit()
    return RedirectResponse("/facebook?notice=disconnected", status_code=303)


@router.post("/ads/{ad_id}/post")
async def post_ad(ad_id: int, db: Session = Depends(get_db)):
    ad = db.query(Ad).filter(Ad.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    if not ad.ad_headline or not ad.ad_body:
        return RedirectResponse(f"/ads/{ad_id}?notice=no_copy", status_code=303)
    page = current_page(db)
    if page is None:
        return RedirectResponse(f"/ads/{ad_id}?notice=not_connected", status_code=303)

    message = page_message(ad.ad_headline, ad.ad_body, ad.ad_cta or "")
    image = _image_payload(ad.image_path)
    try:
        post_id = publish_post(page.page_id, page.access_token, message, image)
    except GraphError as exc:
        return RedirectResponse(
            f"/ads/{ad_id}?" + urlencode({"notice": "post_failed", "detail": str(exc)}),
            status_code=303,
        )

    ad.facebook_post_id = post_id
    ad.facebook_post_url = permalink(post_id)
    ad.status = "active"
    db.commit()
    return RedirectResponse(f"/ads/{ad_id}?notice=posted", status_code=303)


def _save_page(db: Session, page: dict) -> None:
    db.query(FacebookPage).delete()
    db.add(
        FacebookPage(
            page_id=page["id"],
            page_name=page["name"],
            access_token=page["access_token"],
        )
    )
    db.commit()


def _image_payload(image_path: str | None):
    if not image_path:
        return None
    path = resolve_media(image_path)
    if not path.exists():
        return None
    ext = path.suffix.lstrip(".").lower()
    content_type = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
    return path.name, path.read_bytes(), content_type
