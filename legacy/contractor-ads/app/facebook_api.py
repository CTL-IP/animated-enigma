"""Facebook Page publishing. Graph API v26.0.

A Page post is not a paid ad. Nothing here spends money.
"""
import json
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

GRAPH = "https://graph.facebook.com/v26.0"
DIALOG = "https://www.facebook.com/v26.0/dialog/oauth"
SCOPES = "pages_show_list,pages_manage_posts,pages_read_engagement"


class GraphError(Exception):
    pass


def page_message(headline: str, body: str, cta: str) -> str:
    parts = [headline.strip(), "", body.strip()]
    if cta and cta.strip():
        parts.extend(["", cta.strip()])
    return "\n".join(parts).strip()


def permalink(post_id: str) -> str:
    """pageId_storyId -> the public post URL."""
    page_id, _, story_id = post_id.partition("_")
    if page_id and story_id:
        return f"https://www.facebook.com/{page_id}/posts/{story_id}"
    return f"https://www.facebook.com/{post_id}"


def oauth_dialog_url(app_id: str, redirect_uri: str, state: str) -> str:
    query = urlencode(
        {
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": SCOPES,
            "response_type": "code",
        }
    )
    return f"{DIALOG}?{query}"


def exchange_code(app_id: str, app_secret: str, redirect_uri: str, code: str) -> str:
    payload = _get(
        "/oauth/access_token",
        {
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        },
    )
    token = payload.get("access_token")
    if not token:
        raise GraphError("Facebook did not return a user token.")
    return token


def list_pages(user_token: str) -> list[dict]:
    payload = _get("/me/accounts", {"access_token": user_token})
    pages = []
    for item in payload.get("data") or []:
        if item.get("id") and item.get("access_token"):
            pages.append(
                {
                    "id": str(item["id"]),
                    "name": item.get("name") or item["id"],
                    "access_token": item["access_token"],
                }
            )
    return pages


def publish_post(page_id: str, page_token: str, message: str, image: Path | None = None) -> str:
    if image and image.is_file():
        payload = _post_photo(page_id, page_token, message, image)
        post_id = payload.get("post_id") or payload.get("id")
    else:
        payload = _post(
            f"/{page_id}/feed",
            {"message": message, "access_token": page_token},
        )
        post_id = payload.get("id")
    if not post_id:
        raise GraphError("Facebook accepted the call but did not return a post id.")
    return str(post_id)


def _get(path: str, query: dict) -> dict:
    url = f"{GRAPH}{path}?{urlencode(query)}"
    return _read(Request(url, method="GET"))


def _post(path: str, fields: dict) -> dict:
    body = urlencode(fields).encode()
    request = Request(
        f"{GRAPH}{path}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return _read(request)


def _post_photo(page_id: str, page_token: str, message: str, image: Path) -> dict:
    boundary = uuid.uuid4().hex
    chunks = []
    for name, value in (("message", message), ("access_token", page_token)):
        chunks.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
        )
    filename = image.name.replace('"', "")
    chunks.append(
        (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"source\"; filename=\"{filename}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode()
        + image.read_bytes()
        + b"\r\n"
    )
    chunks.append(f"--{boundary}--\r\n".encode())
    request = Request(
        f"{GRAPH}/{page_id}/photos",
        data=b"".join(chunks),
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    return _read(request)


def _read(request: Request) -> dict:
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read().decode()
    except HTTPError as error:
        raw = error.read().decode(errors="replace")
        message = _error_message(raw) or f"Facebook returned HTTP {error.code}."
        raise GraphError(message) from error
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError as error:
        raise GraphError("Facebook returned a response that was not JSON.") from error
    if isinstance(payload, dict) and payload.get("error"):
        raise GraphError(_error_message(raw) or "Facebook rejected the request.")
    return payload


def _error_message(raw: str) -> str:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return ""
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        return str(error.get("message") or "")
    return ""
