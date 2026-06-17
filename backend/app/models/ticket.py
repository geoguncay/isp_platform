"""
Modelo SQLAlchemy: ClientTicket
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ClientTicket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    cliente_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("clients.id"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    prioridad: Mapped[str] = mapped_column(String(20), nullable=False, default="media")  # "baja", "media", "alta"
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="abierto")  # "abierto", "en_proceso", "resuelto", "cerrado"
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
    client = relationship("Client", back_populates="tickets")

    def __repr__(self) -> str:
        return f"<ClientTicket id={self.id} cliente_id={self.cliente_id} titulo={self.titulo} estado={self.estado}>"
