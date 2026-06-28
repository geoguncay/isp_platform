"""
API de logs de auditoría del sistema ISP.
"""
from datetime import datetime

from fastapi import APIRouter, Query
from sqlalchemy import desc

from app.core.deps import AdminOnly, DBSession
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogListResponse, AuditLogRead

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=AuditLogListResponse)
def list_audit_logs(
    db: DBSession,
    _: AdminOnly,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    accion: str | None = Query(None, description="Filtrar por tipo de acción"),
    entidad_tipo: str | None = Query(None, description="Filtrar por tipo de entidad"),
    entidad_id: str | None = Query(None, description="Filtrar por ID de entidad"),
    usuario_id: str | None = Query(None, description="Filtrar por usuario"),
    fecha_desde: datetime | None = Query(None, description="Desde fecha (ISO 8601)"),
    fecha_hasta: datetime | None = Query(None, description="Hasta fecha (ISO 8601)"),
) -> AuditLogListResponse:
    """
    Lista los eventos de auditoría con filtros opcionales. Solo accesible por admins.
    """
    q = db.query(AuditLog)

    if accion:
        q = q.filter(AuditLog.accion == accion)
    if entidad_tipo:
        q = q.filter(AuditLog.entidad_tipo == entidad_tipo)
    if entidad_id:
        q = q.filter(AuditLog.entidad_id == entidad_id)
    if usuario_id:
        q = q.filter(AuditLog.usuario_id == usuario_id)
    if fecha_desde:
        q = q.filter(AuditLog.created_at >= fecha_desde)
    if fecha_hasta:
        q = q.filter(AuditLog.created_at <= fecha_hasta)

    total = q.count()
    items = q.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()

    return AuditLogListResponse(
        items=[AuditLogRead.model_validate(item) for item in items],
        total=total,
    )
