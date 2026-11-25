from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.deps import DbSession, client_ip
from app.rate_limit import limiter
from app.schemas.public import (
    PublicAcceptRequest,
    PublicActionResponse,
    PublicOfferOut,
    PublicRejectRequest,
)
from app.services import documents, offers as offer_service

router = APIRouter(prefix="/public/offers", tags=["candidate portal"])


@router.get("/{token}", response_model=PublicOfferOut)
@limiter.limit("60/minute")
def view_public_offer(token: str, request: Request, db: DbSession):
    return offer_service.get_public_offer(db, token, request)


@router.get("/{token}/preview")
@limiter.limit("60/minute")
def preview_public_offer(token: str, request: Request, db: DbSession):
    html_content = documents.sanitize_preview(offer_service.public_preview(db, token))
    return Response(
        content=html_content,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Security-Policy": (
                "default-src 'none'; style-src 'unsafe-inline'; img-src data:; "
                "font-src data:; base-uri 'none'; form-action 'none'"
            ),
            "Cache-Control": "private, no-store",
            "X-Frame-Options": "SAMEORIGIN",
        },
    )


@router.get("/{token}/pdf")
@limiter.limit("30/minute")
def download_public_pdf(token: str, request: Request, db: DbSession):
    content, filename = offer_service.public_pdf(db, token)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/{token}/accept", response_model=PublicActionResponse)
@limiter.limit("10/minute")
def accept_public_offer(
    token: str,
    payload: PublicAcceptRequest,
    request: Request,
    db: DbSession,
):
    return offer_service.accept_public_offer(
        db,
        token,
        typed_name=payload.typed_name,
        ip=client_ip(request),
        agent=request.headers.get("user-agent"),
    )


@router.post("/{token}/reject", response_model=PublicActionResponse)
@limiter.limit("10/minute")
def reject_public_offer(
    token: str,
    payload: PublicRejectRequest,
    request: Request,
    db: DbSession,
):
    return offer_service.reject_public_offer(
        db,
        token,
        reason=payload.reason,
        ip=client_ip(request),
        agent=request.headers.get("user-agent"),
    )
