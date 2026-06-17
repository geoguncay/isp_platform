"""
Modelo SQLAlchemy: ClientPlan
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ClientPlan(Base):
    __tablename__ = "client_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    cliente_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("clients.id"), nullable=False
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("plans.id"), nullable=False
    )
    fecha_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    fecha_fin: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="activo")  # "activo", "suspendido", "cancelado"
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
    client = relationship("Client", back_populates="client_plans")
    plan = relationship("Plan", back_populates="client_plans")

    def __repr__(self) -> str:
        return f"<ClientPlan id={self.id} cliente_id={self.cliente_id} plan_id={self.plan_id} estado={self.estado}>"
