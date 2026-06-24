"""
Esquemas Pydantic para Inventario (InventoryItem)
"""
import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.supplier_schema import SupplierResponse

class InventoryItemBase(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    codigo: str = Field(min_length=1, max_length=50)
    cantidad: int = Field(default=0, ge=0)
    minimo_alerta: int = Field(default=5, ge=0)
    precio_compra: float = Field(default=0.0, ge=0.0)
    precio_venta: float = Field(default=0.0, ge=0.0)
    descripcion: str | None = None
    categoria: str | None = Field(default=None, max_length=50)
    modelo: str | None = Field(default=None, max_length=80)
    proveedor_id: uuid.UUID | None = None

class InventoryItemCreate(InventoryItemBase):
    pass

class InventoryItemUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    codigo: str | None = Field(default=None, min_length=1, max_length=50)
    cantidad: int | None = Field(default=None, ge=0)
    minimo_alerta: int | None = Field(default=None, ge=0)
    precio_compra: float | None = Field(default=None, ge=0.0)
    precio_venta: float | None = Field(default=None, ge=0.0)
    descripcion: str | None = None
    categoria: str | None = Field(default=None, max_length=50)
    modelo: str | None = Field(default=None, max_length=80)
    proveedor_id: uuid.UUID | None = None

class InventoryItemResponse(InventoryItemBase):
    model_config = {"from_attributes": True}
    
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    proveedor: SupplierResponse | None = None
