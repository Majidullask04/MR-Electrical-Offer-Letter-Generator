from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger("offerlater.errors")


def error_body(
    code: str,
    message: str,
    *,
    fields: list[dict[str, Any]] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    if extra:
        body.update({key: value for key, value in extra.items() if key not in body})
    return body


def _http_error_payload(detail: Any, status_code: int) -> dict[str, Any]:
    if isinstance(detail, dict):
        payload = dict(detail)
        payload.setdefault("code", f"HTTP_{status_code}")
        payload.setdefault("message", "The request could not be completed.")
        return payload
    if isinstance(detail, str):
        return error_body(f"HTTP_{status_code}", detail)
    return error_body(f"HTTP_{status_code}", "The request could not be completed.")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        response = JSONResponse(
            status_code=exc.status_code,
            content=_http_error_payload(exc.detail, exc.status_code),
            headers=exc.headers,
        )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = []
        for item in exc.errors():
            location = [str(part) for part in item.get("loc", []) if part not in {"body", "query", "path"}]
            fields.append(
                {
                    "field": ".".join(location) or "request",
                    "message": item.get("msg", "Invalid value."),
                    "type": item.get("type", "value_error"),
                }
            )
        return JSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_ERROR",
                "Some fields need attention. Check the highlighted inputs and try again.",
                fields=fields,
            ),
        )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content=error_body(
                "RATE_LIMITED",
                "Too many attempts. Wait a minute and try again.",
            ),
            headers={"Retry-After": "60"},
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception("Unhandled error on %s %s (request %s)", request.method, request.url.path, request_id)
        return JSONResponse(
            status_code=500,
            content=error_body(
                "INTERNAL_ERROR",
                "Something went wrong on our side. Try again; if it persists, contact an administrator.",
            ),
        )
