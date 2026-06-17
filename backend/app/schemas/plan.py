"""
Schemas Pydantic v2 para Planes de ancho de banda.
"""
import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class PlanBase(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    velocidad_down_mbps: int = Field(ge=1, le=10000)
    velocidad_up_mbps: int = Field(ge=1, le=10000)
    precio: float = Field(gt=0.0)


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    velocidad_down_mbps: int | None = Field(default=None, ge=1, le=10000)
    velocidad_up_mbps: int | None = Field(default=None, ge=1, le=10000)
    precio: float | None = Field(default=None, gt=0.0)


class PlanResponse(PlanBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
