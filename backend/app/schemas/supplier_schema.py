"""
Esquemas Pydantic para Proveedores (Suppliers)
"""
import uuid
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr

class SupplierBase(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    ruc: str = Field(min_length=10, max_length=20)
    telefono: str = Field(min_length=5, max_length=40)
    email: EmailStr | None = None
    direccion: str = Field(min_length=5, max_length=255)
    notas: str | None = None

class SupplierCreate(SupplierBase):
    pass

class SupplierUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    ruc: str | None = Field(default=None, min_length=10, max_length=20)
    telefono: str | None = Field(default=None, min_length=5, max_length=40)
    email: EmailStr | None = None
    direccion: str | None = Field(default=None, min_length=5, max_length=255)
    notas: str | None = None

class SupplierResponse(SupplierBase):
    model_config = {"from_attributes": True}
    
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
