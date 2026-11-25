from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from app.deps import DbSession
from app.rate_limit import limiter
from app.schemas.verify import VerifyLookupRequest, VerifyResultOut
from app.services import verification as verification_service

router = APIRouter(prefix="/public/verify", tags=["verification"])

MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024


@router.get("/token/{token}", response_model=VerifyResultOut)
@limiter.limit("60/minute")
def verify_token(token: str, request: Request, db: DbSession):
    return verification_service.verify_by_token(db, token)


@router.post("/lookup", response_model=VerifyResultOut)
@limiter.limit("30/minute")
def verify_lookup(payload: VerifyLookupRequest, request: Request, db: DbSession):
    return verification_service.verify_by_lookup(db, payload)


@router.post("/pdf", response_model=VerifyResultOut)
@limiter.limit("20/minute")
async def verify_pdf_upload(
    request: Request,
    db: DbSession,
    file: UploadFile = File(...),
    offer_id: str | None = Form(default=None),
    token: str | None = Form(default=None),
    candidate_email: str | None = Form(default=None),
):
    content = await file.read(MAX_PDF_UPLOAD_BYTES + 1)
    if len(content) > MAX_PDF_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "PDF_TOO_LARGE", "message": "Uploaded PDF must be 10 MB or smaller."},
        )
    if not content.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_PDF", "message": "Upload a valid PDF file."},
        )
    return verification_service.verify_uploaded_pdf(
        db,
        content,
        offer_id=offer_id.strip() if offer_id and offer_id.strip() else None,
        token=token.strip() if token and token.strip() else None,
        candidate_email=candidate_email.strip() if candidate_email and candidate_email.strip() else None,
    )
