from __future__ import annotations

import logging
import secrets
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.errors import error_body

logger = logging.getLogger("offerlater.http")

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_EXEMPT_PREFIXES = (
    "/api/v1/auth/login",
    "/api/v1/public/",
)
CSRF_EXEMPT_PATHS = {"/api/v1/health", "/health"}
MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_PDF_UPLOAD_BODY_BYTES = 11 * 1024 * 1024


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class CSRFTokenMiddleware(BaseHTTPMiddleware):
    """Double-submit cookie protection for cookie-authenticated staff routes."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        path = request.url.path
        if request.method in UNSAFE_METHODS and path.startswith("/api/"):
            exempt = path in CSRF_EXEMPT_PATHS or any(
                path.startswith(prefix) for prefix in CSRF_EXEMPT_PREFIXES
            )
            has_session = settings.session_cookie in request.cookies
            if not exempt and has_session:
                cookie_token = request.cookies.get(settings.csrf_cookie)
                header_token = request.headers.get("x-csrf-token")
                if not cookie_token or not header_token or not secrets.compare_digest(
                    cookie_token, header_token
                ):
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content=error_body(
                            "CSRF_FAILED",
                            "Your security token is missing or stale. Refresh the page and try again.",
                        ),
                    )
        return await call_next(request)


class _BodyTooLarge(Exception):
    pass


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method in UNSAFE_METHODS:
            limit = (
                MAX_PDF_UPLOAD_BODY_BYTES
                if request.url.path == "/api/v1/public/verify/pdf"
                else MAX_BODY_BYTES
            )
            length = request.headers.get("content-length")
            if length:
                try:
                    if int(length) > limit:
                        return JSONResponse(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            content=error_body(
                                "PAYLOAD_TOO_LARGE",
                                "That request is too large. Reduce the content and try again.",
                            ),
                        )
                except ValueError:
                    pass
            else:
                # Chunked / streamed request: wrap the ASGI receive channel and
                # count cumulative bytes so the limit is enforced even without a
                # Content-Length header.
                original_receive = request._receive
                received_bytes = 0

                async def counting_receive():
                    nonlocal received_bytes
                    message = await original_receive()
                    if message["type"] == "http.request":
                        received_bytes += len(message.get("body", b""))
                        if received_bytes > limit:
                            raise _BodyTooLarge()
                    return message

                request._receive = counting_receive
                try:
                    return await call_next(request)
                except _BodyTooLarge:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content=error_body(
                            "PAYLOAD_TOO_LARGE",
                            "That request is too large. Reduce the content and try again.",
                        ),
                    )
        return await call_next(request)
