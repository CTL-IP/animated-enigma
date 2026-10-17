"""Facebook Page publishing. Graph API v26.0.

A Page post is not a paid ad. Nothing here spends money.
"""
import json
import uuid
from urllib.error import HTTPError
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
    from urllib.parse import urlencode

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


def _request(method: str, url: str, token: str, data: bytes | None = None, content_type: str | None = None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise GraphError(_error_message(raw)) from None
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise GraphError("Facebook returned a response that was not JSON") from exc
    if isinstance(payload, dict) and payload.get("error"):
        raise GraphError(_error_message(raw))
    return payload


def _error_message(raw: str) -> str:
    try:
        payload = json.loads(raw)
        message = payload.get("error", {}).get("message")
        if message:
            return str(message)[:300]
    except json.JSONDecodeError:
        pass
    return "Facebook rejected the request"


def exchange_code(app_id: str, app_secret: str, redirect_uri: str, code: str) -> str:
    from urllib.parse import urlencode

    query = urlencode(
        {
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        }
    )
    payload = _request("GET", f"{GRAPH}/oauth/access_token?{query}", token="")
    token = payload.get("access_token")
    if not token:
        raise GraphError("Facebook did not return an access token")
    long_lived = _request(
        "GET",
        f"{GRAPH}/oauth/access_token?"
        + urlencode(
            {
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": token,
            }
        ),
        token="",
    )
    return long_lived.get("access_token") or token


def list_pages(user_token: str) -> list[dict]:
    payload = _request("GET", f"{GRAPH}/me/accounts?fields=id,name,access_token", user_token)
    pages = []
    for item in payload.get("data") or []:
        if item.get("id") and item.get("name") and item.get("access_token"):
            pages.append(
                {"id": str(item["id"]), "name": str(item["name"]), "access_token": str(item["access_token"])}
            )
    return pages


def publish_post(page_id: str, page_token: str, message: str, image: tuple[str, bytes, str] | None) -> str:
    """Return the Page post id. image is (filename, bytes, content_type) or None."""
    if image:
        filename, content, content_type = image
        body, mime = _multipart(
            {"caption": message},
            "source",
            filename,
            content,
            content_type,
        )
        payload = _request(
            "POST",
            f"{GRAPH}/{page_id}/photos",
            page_token,
            data=body,
            content_type=mime,
        )
        post_id = payload.get("post_id") or payload.get("id")
    else:
        from urllib.parse import urlencode

        payload = _request(
            "POST",
            f"{GRAPH}/{page_id}/feed",
            page_token,
            data=urlencode({"message": message}).encode("utf-8"),
            content_type="application/x-www-form-urlencoded",
        )
        post_id = payload.get("id")
    if not post_id:
        raise GraphError("Facebook did not return a post id")
    return str(post_id)


def _multipart(fields: dict, file_field: str, filename: str, content: bytes, content_type: str):
    boundary = "pttr" + uuid.uuid4().hex
    chunks = []
    for key, value in fields.items():
        chunks.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()
        )
    chunks.append(
        (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode()
        + content
        + b"\r\n"
    )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"
