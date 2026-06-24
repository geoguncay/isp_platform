"""
Modelo SQLAlchemy: Supplier (Proveedores)
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Uuid, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    ruc: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    telefono: Mapped[str] = mapped_column(String(40), nullable=False)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    direccion: Mapped[str] = mapped_column(String(255), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relación con ítems de inventario
    inventory_items = relationship("InventoryItem", back_populates="proveedor")

    def __repr__(self) -> str:
        return f"<Supplier id={self.id} nombre={self.nombre} ruc={self.ruc}>"
