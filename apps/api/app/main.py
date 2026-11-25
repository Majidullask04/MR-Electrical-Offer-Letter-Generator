from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1 import (
    admin,
    auth,
    candidates,
    company,
    generator,
    health,
    notifications,
    offers,
    public,
    reports,
    templates,
    verify,
)
from app.config import settings
from app.errors import install_error_handlers
from app.middleware import BodySizeLimitMiddleware, CSRFTokenMiddleware, RequestContextMiddleware
from app.rate_limit import limiter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("offerlater")


def _validate_settings() -> None:
    if settings.is_production:
        if settings.secret_key.startswith("dev-only"):
            raise RuntimeError("SECRET_KEY must be replaced before running in production.")
        if not settings.cookie_secure:
            raise RuntimeError("COOKIE_SECURE must be true in production.")
        if "*" in settings.cors_origin_list:
            raise RuntimeError("CORS_ORIGINS must name the deployed frontend in production.")
    settings.storage_path.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_settings()
    logger.info(
        "OfferLater %s starting | env=%s | storage=%s | email=%s",
        __version__,
        settings.app_env,
        settings.storage_path,
        settings.email_provider,
    )
    yield
    logger.info("OfferLater shutting down")


app = FastAPI(
    title="OfferLater API",
    version=__version__,
    description=(
        "Offer letter management for MR. ELECTRICAL WORKS: drafting, approvals, "
        "immutable issuance and a secure candidate portal."
    ),
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.state.limiter = limiter

app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(CSRFTokenMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Content-Disposition"],
    max_age=600,
)

install_error_handlers(app)

PREFIX = settings.api_v1_prefix
app.include_router(auth.router, prefix=PREFIX)
app.include_router(candidates.router, prefix=PREFIX)
app.include_router(offers.router, prefix=PREFIX)
app.include_router(templates.router, prefix=PREFIX)
app.include_router(company.router, prefix=PREFIX)
app.include_router(public.router, prefix=PREFIX)
app.include_router(verify.router, prefix=PREFIX)
app.include_router(generator.router, prefix=PREFIX)
app.include_router(reports.router, prefix=PREFIX)
app.include_router(notifications.router, prefix=PREFIX)
app.include_router(admin.router, prefix=PREFIX)
app.include_router(health.router)
app.include_router(health.router, prefix=PREFIX)


@app.get("/", tags=["health"])
def root():
    return {
        "name": settings.app_name,
        "version": __version__,
        "environment": settings.app_env,
        "docs": None if settings.is_production else "/docs",
        "health": "/health",
    }
