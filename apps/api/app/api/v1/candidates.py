import uuid
from datetime import datetime, time

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select

from app.deps import DbSession, HrOrAdmin, AnyStaff
from app.models import Candidate, JobPosition, Offer
from app.schemas.candidate import (
    CandidateCreate,
    CandidateOut,
    CandidateUpdate,
    JobPositionCreate,
    JobPositionOut,
)
from app.schemas.common import Message, Page
from app.services.audit import record_audit

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("", response_model=Page[CandidateOut])
def list_candidates(
    db: DbSession,
    user: AnyStaff,
    q: str | None = Query(default=None, max_length=120),
    include_inactive: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    filters = []
    if not include_inactive:
        filters.append(Candidate.is_active.is_(True))
    if q:
        term = f"%{q.strip()}%"
        filters.append(
            or_(
                Candidate.full_name.ilike(term),
                Candidate.email.ilike(term),
                Candidate.applied_position.ilike(term),
                Candidate.phone.ilike(term),
            )
        )
    total = db.scalar(select(func.count()).select_from(Candidate).where(*filters)) or 0
    items = db.scalars(
        select(Candidate)
        .where(*filters)
        .order_by(Candidate.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("", response_model=CandidateOut, status_code=status.HTTP_201_CREATED)
def create_candidate(
    payload: CandidateCreate,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    if payload.email:
        existing = db.scalars(
            select(Candidate).where(func.lower(Candidate.email) == payload.email.lower())
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "CANDIDATE_EXISTS",
                    "message": "A candidate with this email already exists. Open that record instead.",
                    "candidate_id": str(existing.id),
                },
            )
    candidate = Candidate(
        **payload.model_dump(),
        created_by_id=user.id,
    )
    db.add(candidate)
    db.flush()
    record_audit(
        db,
        action="candidate.created",
        entity_type="candidate",
        entity_id=candidate.id,
        user=user,
        metadata={"position": candidate.applied_position},
        request=request,
    )
    db.commit()
    db.refresh(candidate)
    return candidate


@router.get("/meta/positions", response_model=list[JobPositionOut])
def list_positions(db: DbSession, user: AnyStaff):
    return db.scalars(
        select(JobPosition).where(JobPosition.is_active.is_(True)).order_by(JobPosition.title)
    ).all()


@router.post("/meta/positions", response_model=JobPositionOut, status_code=status.HTTP_201_CREATED)
def create_position(
    payload: JobPositionCreate,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    existing = db.scalars(
        select(JobPosition).where(func.lower(JobPosition.title) == payload.title.lower())
    ).first()
    if existing:
        return existing
    position = JobPosition(**payload.model_dump())
    db.add(position)
    db.flush()
    record_audit(
        db,
        action="position.created",
        entity_type="job_position",
        entity_id=position.id,
        user=user,
        metadata={"title": position.title},
        request=request,
    )
    db.commit()
    db.refresh(position)
    return position


@router.get("/{candidate_id}", response_model=CandidateOut)
def get_candidate(candidate_id: uuid.UUID, db: DbSession, user: AnyStaff):
    candidate = db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CANDIDATE_NOT_FOUND", "message": "That candidate does not exist."},
        )
    return candidate


@router.patch("/{candidate_id}", response_model=CandidateOut)
def update_candidate(
    candidate_id: uuid.UUID,
    payload: CandidateUpdate,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    candidate = db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CANDIDATE_NOT_FOUND", "message": "That candidate does not exist."},
        )
    changed = payload.model_dump(exclude_unset=True)
    if "email" in changed and changed["email"]:
        duplicate = db.scalars(
            select(Candidate).where(
                func.lower(Candidate.email) == changed["email"].lower(),
                Candidate.id != candidate.id,
            )
        ).first()
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "CANDIDATE_EXISTS", "message": "Another candidate already uses this email."},
            )
    for field, value in changed.items():
        setattr(candidate, field, value)
    record_audit(
        db,
        action="candidate.updated",
        entity_type="candidate",
        entity_id=candidate.id,
        user=user,
        metadata={"fields": sorted(changed.keys())},
        request=request,
    )
    db.commit()
    db.refresh(candidate)
    return candidate


@router.delete("/{candidate_id}", response_model=Message)
def archive_candidate(
    candidate_id: uuid.UUID,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    candidate = db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CANDIDATE_NOT_FOUND", "message": "That candidate does not exist."},
        )
    has_offers = db.scalar(
        select(func.count()).select_from(Offer).where(Offer.candidate_id == candidate.id)
    )
    if has_offers:
        candidate.is_active = False
        record_audit(
            db,
            action="candidate.archived",
            entity_type="candidate",
            entity_id=candidate.id,
            user=user,
            metadata={"reason": "candidate has offer history"},
            request=request,
        )
        db.commit()
        return {"message": "Candidate archived. Existing offer records were preserved."}
    db.delete(candidate)
    record_audit(
        db,
        action="candidate.deleted",
        entity_type="candidate",
        entity_id=candidate_id,
        user=user,
        request=request,
    )
    db.commit()
    return {"message": "Candidate deleted."}
