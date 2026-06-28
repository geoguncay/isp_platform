"""
Esquemas Pydantic v2 para Sitios (Sites).
"""
import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class SiteCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    latitud: float | None = None
    longitud: float | None = None


class SiteUpdate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    latitud: float | None = None
    longitud: float | None = None


class SiteRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    nombre: str
    latitud: float | None = None
    longitud: float | None = None
    created_at: datetime
    updated_at: datetime
