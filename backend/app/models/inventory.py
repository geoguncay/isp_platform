"""
Modelo SQLAlchemy: InventoryItem (Inventario/Stock)
"""
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Uuid, DateTime, Integer, Float, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    codigo: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    minimo_alerta: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    precio_compra: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    precio_venta: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    categoria: Mapped[str | None] = mapped_column(String(50), nullable=True)
    modelo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    
    proveedor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relaciones
    proveedor = relationship("Supplier", back_populates="inventory_items")
    client_assignments = relationship("ClientInventoryItem", back_populates="inventory_item")

    def __repr__(self) -> str:
        return f"<InventoryItem id={self.id} nombre={self.nombre} codigo={self.codigo} cantidad={self.cantidad}>"
