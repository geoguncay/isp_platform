"""
Schemas Pydantic: SystemSettings.
"""
from datetime import datetime

from pydantic import BaseModel, Field


class MikrotikApiConfig(BaseModel):
    mikrotik_timeout: int = Field(default=10, ge=1, le=120)
    mikrotik_attempts: int = Field(default=1, ge=1, le=10)
    mikrotik_debug: bool = False
    mikrotik_ssl: bool = False


class MikrotikApiConfigRead(MikrotikApiConfig):
    updated_at: datetime

    model_config = {"from_attributes": True}
