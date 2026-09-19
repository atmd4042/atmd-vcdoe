import os
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "اعتمد")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{EMAIL_BASE_URL}/api/v1/email/send",
            headers={"X-Email-Key": EMAIL_KEY},
            json=payload,
        )
    resp.raise_for_status()
    return resp.json().get("id")


async def send_otp_email(to: str, code: str, purpose: str = "login") -> None:
    title = "رمز التحقق - اعتمد"
    html = (
        f'<div dir="rtl" style="font-family:Arial,sans-serif;background:#F3F4F6;padding:24px">'
        f'<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;'
        f'background:#FFFFFF;border-radius:16px;overflow:hidden">'
        f'<tr><td style="background:#046C4E;padding:24px;text-align:center">'
        f'<h1 style="color:#FFFFFF;margin:0;font-size:22px">اعتمد</h1></td></tr>'
        f'<tr><td style="padding:28px;text-align:right">'
        f'<p style="font-size:16px;color:#111827;margin:0 0 12px">مرحباً بك،</p>'
        f'<p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.7">'
        f'رمز التحقق الخاص بك لإتمام العملية هو:</p>'
        f'<div style="text-align:center;margin:18px 0">'
        f'<span style="display:inline-block;font-size:34px;letter-spacing:8px;font-weight:bold;'
        f'color:#046C4E;background:#ECFDF5;padding:14px 24px;border-radius:12px">{escape(code)}</span></div>'
        f'<p style="font-size:14px;color:#6B7280;margin:16px 0 0;line-height:1.7">'
        f'هذا الرمز صالح لمدة 10 دقائق ويُستخدم لمرة واحدة. إذا لم تطلب هذا الرمز تجاهل هذه الرسالة.</p>'
        f'<p style="font-size:12px;color:#9CA3AF;margin:24px 0 0">'
        f'رسالة من تطبيق اعتمد. لن نطلب منك كلمة المرور أبداً عبر البريد.</p>'
        f'</td></tr></table></div>'
    )
    await send_email(to=to, subject=title, html=html)
