"""
Modelo SQLAlchemy: ClientPayment
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ClientPayment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    cliente_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("clients.id"), nullable=False
    )
    monto: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    fecha_pago: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    metodo: Mapped[str] = mapped_column(String(50), nullable=False)  # "efectivo", "transferencia", "deposito"
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="completado")  # "completado", "pendiente", "fallido"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relaciones
    client = relationship("Client", back_populates="payments")

    def __repr__(self) -> str:
        return f"<ClientPayment id={self.id} cliente_id={self.cliente_id} monto={self.monto} estado={self.estado}>"
