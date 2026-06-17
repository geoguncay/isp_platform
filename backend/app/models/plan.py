"""
Modelo SQLAlchemy: Plan
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    velocidad_down_mbps: Mapped[int] = mapped_column(Integer, nullable=False)
    velocidad_up_mbps: Mapped[int] = mapped_column(Integer, nullable=False)
    precio: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relación a ClientPlan
    client_plans = relationship("ClientPlan", back_populates="plan", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Plan id={self.id} nombre={self.nombre} precio={self.precio}>"
