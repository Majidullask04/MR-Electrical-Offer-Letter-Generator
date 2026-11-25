from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from app.deps import AnyStaff, DbSession, SuperAdmin
from app.models import Offer, OfferTemplate, TemplateBlock
from app.schemas.common import Message
from app.schemas.template import (
    TemplateBlockCreate,
    TemplateBlockOut,
    TemplateBlockUpdate,
    TemplateCreate,
    TemplateOut,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    TemplateUpdate,
)
from app.services.audit import record_audit
from app.services.templates import preview_template

router = APIRouter(prefix="/templates", tags=["templates"])


def _template_or_404(db, template_id: uuid.UUID) -> OfferTemplate:
    template = db.get(OfferTemplate, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TEMPLATE_NOT_FOUND", "message": "That template does not exist."},
        )
    return template


@router.get("", response_model=list[TemplateOut])
def list_templates(db: DbSession, user: AnyStaff):
    return db.scalars(
        select(OfferTemplate).order_by(OfferTemplate.is_default.desc(), OfferTemplate.name)
    ).all()


@router.get("/blocks", response_model=list[TemplateBlockOut])
def list_blocks(db: DbSession, user: AnyStaff):
    return db.scalars(select(TemplateBlock).order_by(TemplateBlock.name)).all()


@router.post("/blocks", response_model=TemplateBlockOut, status_code=status.HTTP_201_CREATED)
def create_block(
    payload: TemplateBlockCreate,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    existing = db.scalars(select(TemplateBlock).where(TemplateBlock.key == payload.key)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BLOCK_EXISTS", "message": "A block with that key already exists."},
        )
    block = TemplateBlock(**payload.model_dump())
    db.add(block)
    db.flush()
    record_audit(
        db,
        action="template_block.created",
        entity_type="template_block",
        entity_id=block.id,
        user=user,
        metadata={"key": block.key},
        request=request,
    )
    db.commit()
    db.refresh(block)
    return block


@router.patch("/blocks/{block_id}", response_model=TemplateBlockOut)
def update_block(
    block_id: uuid.UUID,
    payload: TemplateBlockUpdate,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    block = db.get(TemplateBlock, block_id)
    if not block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BLOCK_NOT_FOUND", "message": "That content block does not exist."},
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(block, field, value)
    record_audit(
        db,
        action="template_block.updated",
        entity_type="template_block",
        entity_id=block.id,
        user=user,
        metadata={"fields": sorted(payload.model_dump(exclude_unset=True).keys())},
        request=request,
    )
    db.commit()
    db.refresh(block)
    return block


@router.delete("/blocks/{block_id}", response_model=Message)
def delete_block(
    block_id: uuid.UUID,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    block = db.get(TemplateBlock, block_id)
    if not block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BLOCK_NOT_FOUND", "message": "That content block does not exist."},
        )
    record_audit(
        db,
        action="template_block.deleted",
        entity_type="template_block",
        entity_id=block.id,
        user=user,
        metadata={"key": block.key},
        request=request,
    )
    db.delete(block)
    db.commit()
    return {"message": "Content block deleted."}


@router.post("/preview", response_model=TemplatePreviewResponse)
def preview_template_content(
    payload: TemplatePreviewRequest,
    db: DbSession,
    user: AnyStaff,
):
    template = OfferTemplate(
        id=uuid.uuid4(),
        name="Preview",
        html_content=payload.html_content,
        version=1,
    )
    return {"html": preview_template(db, template)}


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: uuid.UUID, db: DbSession, user: AnyStaff):
    return _template_or_404(db, template_id)


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: TemplateCreate,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    existing = db.scalars(select(OfferTemplate).where(OfferTemplate.name == payload.name)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "TEMPLATE_EXISTS", "message": "A template with that name already exists."},
        )
    has_templates = bool(db.scalar(select(func.count()).select_from(OfferTemplate)))
    if payload.is_default:
        for template in db.scalars(select(OfferTemplate).where(OfferTemplate.is_default.is_(True))):
            template.is_default = False
    template = OfferTemplate(
        **payload.model_dump(exclude={"is_default"}),
        is_default=payload.is_default or not has_templates,
        version=1,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(template)
    db.flush()
    record_audit(
        db,
        action="template.created",
        entity_type="offer_template",
        entity_id=template.id,
        user=user,
        metadata={"name": template.name},
        request=request,
    )
    db.commit()
    db.refresh(template)
    return template


@router.patch("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: uuid.UUID,
    payload: TemplateUpdate,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    template = _template_or_404(db, template_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] != template.name:
        existing = db.scalars(
            select(OfferTemplate).where(
                OfferTemplate.name == changes["name"], OfferTemplate.id != template.id
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "TEMPLATE_EXISTS", "message": "A template with that name already exists."},
            )
    if changes.get("html_content") and changes["html_content"] != template.html_content:
        template.version += 1
    for field, value in changes.items():
        setattr(template, field, value)
    template.updated_by_id = user.id
    record_audit(
        db,
        action="template.updated",
        entity_type="offer_template",
        entity_id=template.id,
        user=user,
        metadata={"fields": sorted(changes.keys()), "version": template.version},
        request=request,
    )
    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/duplicate", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def duplicate_template(
    template_id: uuid.UUID,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    source = _template_or_404(db, template_id)
    base_name = f"{source.name} copy"
    name = base_name
    index = 2
    while db.scalars(select(OfferTemplate).where(OfferTemplate.name == name)).first():
        name = f"{base_name} {index}"
        index += 1
    template = OfferTemplate(
        name=name,
        description=source.description,
        html_content=source.html_content,
        version=1,
        is_default=False,
        is_active=True,
        signatory_name=source.signatory_name,
        signatory_title=source.signatory_title,
        signatory_email=source.signatory_email,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(template)
    db.flush()
    record_audit(
        db,
        action="template.duplicated",
        entity_type="offer_template",
        entity_id=template.id,
        user=user,
        metadata={"source_id": str(source.id)},
        request=request,
    )
    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/default", response_model=TemplateOut)
def set_default_template(
    template_id: uuid.UUID,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    template = _template_or_404(db, template_id)
    if not template.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "TEMPLATE_INACTIVE", "message": "Activate the template before making it default."},
        )
    for other in db.scalars(select(OfferTemplate).where(OfferTemplate.is_default.is_(True))):
        other.is_default = False
    template.is_default = True
    template.updated_by_id = user.id
    record_audit(
        db,
        action="template.default_set",
        entity_type="offer_template",
        entity_id=template.id,
        user=user,
        metadata={"name": template.name},
        request=request,
    )
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", response_model=Message)
def delete_template(
    template_id: uuid.UUID,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    template = _template_or_404(db, template_id)
    used = db.scalar(select(func.count()).select_from(Offer).where(Offer.template_id == template.id)) or 0
    if used:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "TEMPLATE_IN_USE",
                "message": "This template is used by existing offers. Deactivate it instead.",
            },
        )
    if template.is_default:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "TEMPLATE_DEFAULT", "message": "Set another template as default before deleting this one."},
        )
    record_audit(
        db,
        action="template.deleted",
        entity_type="offer_template",
        entity_id=template.id,
        user=user,
        metadata={"name": template.name},
        request=request,
    )
    db.delete(template)
    db.commit()
    return {"message": "Template deleted."}
