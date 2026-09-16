from functools import lru_cache
from pydantic import BaseModel
import os


class Settings(BaseModel):
    database_url: str
    app_url: str
    token_pepper: str
    cookie_secure: bool = False


@lru_cache
def settings() -> Settings:
    url = os.environ.get("DATABASE_URL", "")
    pepper = os.environ.get("TOKEN_PEPPER", "")
    app_url = os.environ.get("APP_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    if len(pepper) < 32:
        raise RuntimeError("TOKEN_PEPPER must have at least 32 characters")
    if not app_url:
        raise RuntimeError("APP_URL is required")
    return Settings(
        database_url=url.replace("?schema=public", ""),
        app_url=app_url,
        token_pepper=pepper,
        cookie_secure=os.environ.get("COOKIE_SECURE") == "true",
    )
