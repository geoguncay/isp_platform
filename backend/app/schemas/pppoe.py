"""
Schemas Pydantic v2 para perfiles y secretos PPPoE.
"""
import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class PPPoEProfileBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    velocidad_down_mbps: int | None = Field(default=None, ge=0)
    velocidad_up_mbps: int | None = Field(default=None, ge=0)


class PPPoEProfileCreate(PPPoEProfileBase):
    gateway_id: uuid.UUID


class PPPoEProfileRead(PPPoEProfileBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    gateway_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PPPoESecretBase(BaseModel):
    usuario_ppp: str = Field(min_length=1, max_length=100)
    perfil_id: uuid.UUID | None = None


class PPPoESecretCreate(PPPoESecretBase):
    cliente_id: uuid.UUID
    contraseña_ppp: str = Field(min_length=1, max_length=255)
    gateway_id: uuid.UUID


class PPPoESecretUpdate(BaseModel):
    usuario_ppp: str | None = Field(default=None, min_length=1, max_length=100)
    contraseña_ppp: str | None = Field(default=None, min_length=1, max_length=255)
    perfil_id: uuid.UUID | None = None


class PPPoESecretRead(PPPoESecretBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    cliente_id: uuid.UUID
    gateway_id: uuid.UUID
    contraseña_ppp: str | None = None
    created_at: datetime
    updated_at: datetime


class PPPoESessionActive(BaseModel):
    id: str | None = None
    username: str
    ip_address: str | None = None
    uptime: str | None = None
    caller_id: str | None = None  # MAC address
    bytes_tx: int | None = 0
    bytes_rx: int | None = 0
    bytes_tx_human: str | None = "0 B"
    bytes_rx_human: str | None = "0 B"
