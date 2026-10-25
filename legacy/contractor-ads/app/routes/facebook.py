import os
import secrets
from urllib.parse import quote

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
            "page": page,
            "ready": meta_config() is not None,
            "redirect_uri": (os.environ.get("META_REDIRECT_URI") or "http://127.0.0.1:8000/facebook/callback").strip(),
            "notice": notice,
            "detail": (detail or "")[:300],
        },
    )


@router.get("/facebook/start")
async def facebook_start(db: Session = Depends(get_db)):
    cfg = meta_config()
    if cfg is None:
        return RedirectResponse(url="/facebook?notice=missing_app", status_code=303)
    app_id, _, redirect_uri = cfg
    state = secrets.token_urlsafe(24)
    db.add(OAuthState(state=state))
    db.commit()
    return RedirectResponse(url=oauth_dialog_url(app_id, redirect_uri, state), status_code=303)


@router.get("/facebook/callback")
async def facebook_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        return RedirectResponse(
            url=f"/facebook?notice=denied&detail={quote(error_description or error)}",
            status_code=303,
        )
    saved = db.get(OAuthState, state) if state else None
    if saved is None or not code:
        return RedirectResponse(url="/facebook?notice=bad_state", status_code=303)
    db.delete(saved)
    cfg = meta_config()
    if cfg is None:
        db.commit()
        return RedirectResponse(url="/facebook?notice=missing_app", status_code=303)
    app_id, app_secret, redirect_uri = cfg
    try:
        user_token = exchange_code(app_id, app_secret, redirect_uri, code)
        pages = list_pages(user_token)
    except GraphError as exc:
        db.commit()
        return RedirectResponse(url=f"/facebook?notice=graph&detail={quote(str(exc))}", status_code=303)
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
    if not pages:
        return RedirectResponse(url="/facebook?notice=no_pages", status_code=303)
    return RedirectResponse(url="/facebook/pages", status_code=303)


@router.get("/facebook/pages", response_class=HTMLResponse)
async def facebook_pages(request: Request, db: Session = Depends(get_db)):
    choices = db.query(FacebookChoice).order_by(FacebookChoice.page_name).all()
    if not choices:
        return RedirectResponse(url="/facebook?notice=no_pages", status_code=303)
    return templates.TemplateResponse(
        request,
        "facebook_pages.html",
        context={"choices": choices},
    )


@router.post("/facebook/pages")
async def choose_page(page_id: str = Form(...), db: Session = Depends(get_db)):
    choice = db.get(FacebookChoice, page_id)
    if choice is None:
        raise HTTPException(status_code=404, detail="That Page is not in this login.")
    db.query(FacebookPage).delete()
    db.add(
        FacebookPage(
            page_id=choice.page_id,
            page_name=choice.page_name,
            access_token=choice.access_token,
        )
    )
    db.query(FacebookChoice).delete()
    db.commit()
    return RedirectResponse(url="/facebook?notice=connected", status_code=303)


@router.post("/ads/{ad_id}/post")
async def post_ad(ad_id: int, db: Session = Depends(get_db)):
    ad = db.query(Ad).filter(Ad.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    if not (ad.ad_headline or "").strip():
        return RedirectResponse(url=f"/ads/{ad_id}?notice=no_copy", status_code=303)
    page = current_page(db)
    if page is None:
        return RedirectResponse(url=f"/ads/{ad_id}?notice=not_connected", status_code=303)
    image = resolve_media(ad.image_path) if ad.image_path else None
    try:
        post_id = publish_post(
            page.page_id,
            page.access_token,
            page_message(ad.ad_headline or "", ad.ad_body or "", ad.ad_cta or ""),
            image if image and image.is_file() else None,
        )
    except GraphError as exc:
        return RedirectResponse(url=f"/ads/{ad_id}?notice=post_failed&detail={quote(str(exc))}", status_code=303)
    ad.facebook_post_id = post_id
    ad.facebook_post_url = permalink(post_id)
    db.commit()
    return RedirectResponse(url=f"/ads/{ad_id}?notice=posted", status_code=303)
