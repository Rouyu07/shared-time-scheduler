import hashlib, hmac, secrets
from .config import settings


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_id() -> str:
    return secrets.token_urlsafe(18)


def hash_token(token: str) -> str:
    return hmac.new(settings().token_pepper.encode(), token.encode(), hashlib.sha256).hexdigest()


def matches(token: str | None, expected: str) -> bool:
    return bool(token and len(token) <= 256 and hmac.compare_digest(hash_token(token), expected))


def cookie_name(kind: str, public_id: str) -> str:
    return f"st_{kind}_{public_id}"
