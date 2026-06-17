import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class TicketCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=150)
    descripcion: str = Field(min_length=5)
    prioridad: str = Field(default="media")  # "baja", "media", "alta"


class TicketResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    cliente_id: uuid.UUID
    titulo: str
    descripcion: str
    prioridad: str
    estado: str
    created_at: datetime
    updated_at: datetime
