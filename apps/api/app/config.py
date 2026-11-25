from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_env: str = "development"
    app_name: str = "OfferLater"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "dev-only-change-me-please-32-chars-minimum"
    session_ttl_minutes: int = 480
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000"

    database_url: str = (
        "postgresql+psycopg://offerlater:offerlater_dev@localhost:5433/offerlater"
    )

    cookie_secure: bool = False
    cookie_domain: str | None = None

    storage_dir: Path = BASE_DIR / "storage"

    email_provider: str = "console"
    email_from: str = "MR. ELECTRICAL WORKS <offers@example.com>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    resend_api_key: str = ""

    rate_limit_enabled: bool = True

    seed_admin_email: str = "admin@mrelectricalworks.in"
    seed_admin_password: str = "OfferLater!2026"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def session_cookie(self) -> str:
        return "ol_session"

    @property
    def csrf_cookie(self) -> str:
        return "ol_csrf"

    @property
    def storage_path(self) -> Path:
        path = self.storage_dir
        if not path.is_absolute():
            path = BASE_DIR / path
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
