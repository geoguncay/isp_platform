import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    usuario_id: uuid.UUID | None = None
    usuario_nombre: str | None = None
    accion: str
    entidad_tipo: str | None = None
    entidad_id: str | None = None
    entidad_nombre: str | None = None
    detalle: dict | None = None
    ip_address: str | None = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogRead]
    total: int
