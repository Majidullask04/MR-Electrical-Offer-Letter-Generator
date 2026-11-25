from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from app.deps import AnyStaff, DbSession, HrOrAdmin, SuperAdmin
from app.models import Role, User
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.schemas.company import CompanyOut, CompanyUpdate
from app.schemas.offer import TrainingIncrementPolicy
from app.security import ALL_ROLES, hash_password
from app.services.audit import record_audit
from app.services.offers import get_company

router = APIRouter(tags=["company"])


@router.get("/company", response_model=CompanyOut)
def get_company_settings(db: DbSession, user: AnyStaff):
    return get_company(db)


@router.patch("/company", response_model=CompanyOut)
def update_company_settings(
    payload: CompanyUpdate,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    company = get_company(db)
    changes = payload.model_dump(exclude_unset=True)
    if "default_terms" in changes and changes["default_terms"] is not None:
        allowed = {
            "probation",
            "leave_policy",
            "working_hours",
            "confidentiality",
            "notice_period",
            "termination",
            "company_policies",
            "joining_requirements",
            "additional_clauses",
        }
        unknown = set(changes["default_terms"].keys()) - allowed
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "INVALID_TERMS",
                    "message": "One or more clause keys are not supported.",
                    "details": sorted(unknown),
                },
            )
    for field, value in changes.items():
        setattr(company, field, value)
    record_audit(
        db,
        action="company.updated",
        entity_type="company_profile",
        entity_id=company.id,
        user=user,
        metadata={"fields": sorted(changes.keys())},
        request=request,
    )
    db.commit()
    db.refresh(company)
    return company


@router.patch("/company/training-policy", response_model=CompanyOut)
def update_training_policy_defaults(
    payload: TrainingIncrementPolicy,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    company = get_company(db)
    company.default_training_policy = payload.model_dump(mode="json")
    record_audit(
        db,
        action="company.training_policy_updated",
        entity_type="company_profile",
        entity_id=company.id,
        user=user,
        metadata={"default_training_policy": company.default_training_policy},
        request=request,
    )
    db.commit()
    db.refresh(company)
    return company


@router.get("/users", response_model=list[UserOut])
def list_users(db: DbSession, user: SuperAdmin):
    users = db.scalars(select(User).order_by(User.created_at)).all()
    return [UserOut.from_user(item) for item in users]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    if payload.role_key not in ALL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_ROLE", "message": "Choose a valid staff role."},
        )
    existing = db.scalars(select(User).where(func.lower(User.email) == payload.email.lower())).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "USER_EXISTS", "message": "A staff account with that email already exists."},
        )
    role = db.scalars(select(Role).where(Role.key == payload.role_key)).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "ROLE_MISSING", "message": "Roles have not been seeded."},
        )
    new_user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    new_user.roles.append(role)
    db.add(new_user)
    db.flush()
    record_audit(
        db,
        action="user.created",
        entity_type="user",
        entity_id=new_user.id,
        user=user,
        metadata={"role": role.key},
        request=request,
    )
    db.commit()
    db.refresh(new_user)
    return UserOut.from_user(new_user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": "That staff account does not exist."},
        )
    changes = payload.model_dump(exclude_unset=True)
    if target.id == user.id and changes.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CANNOT_DEACTIVATE_SELF", "message": "You cannot deactivate your own account."},
        )
    if changes.get("role_key"):
        if changes["role_key"] not in ALL_ROLES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_ROLE", "message": "Choose a valid staff role."},
            )
        if "SUPER_ADMIN" in target.role_keys and changes["role_key"] != "SUPER_ADMIN":
            other_super_admins = [
                candidate
                for candidate in db.scalars(select(User).where(User.id != target.id, User.is_active.is_(True)))
                if "SUPER_ADMIN" in candidate.role_keys
            ]
            if not other_super_admins:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "LAST_SUPER_ADMIN",
                        "message": "Keep at least one active super admin before changing this role.",
                    },
                )
        role = db.scalars(select(Role).where(Role.key == changes["role_key"])).first()
        if not role:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "ROLE_MISSING", "message": "That role has not been seeded."},
            )
        target.roles = [role]
    if changes.get("is_active") is False and "SUPER_ADMIN" in target.role_keys:
        other_super_admins = [
            candidate
            for candidate in db.scalars(select(User).where(User.id != target.id, User.is_active.is_(True)))
            if "SUPER_ADMIN" in candidate.role_keys
        ]
        if not other_super_admins:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "LAST_SUPER_ADMIN",
                    "message": "Keep at least one active super admin.",
                },
            )
    if changes.get("full_name"):
        target.full_name = changes["full_name"]
    if changes.get("is_active") is not None:
        target.is_active = changes["is_active"]
    if changes.get("password"):
        target.password_hash = hash_password(changes["password"])
    if changes.get("role_key") or changes.get("is_active") is not None or changes.get("password"):
        # Invalidate any existing JWTs so stolen sessions die immediately.
        target.token_version += 1
    record_audit(
        db,
        action="user.updated",
        entity_type="user",
        entity_id=target.id,
        user=user,
        metadata={"fields": sorted(changes.keys())},
        request=request,
    )
    db.commit()
    db.refresh(target)
    return UserOut.from_user(target)
