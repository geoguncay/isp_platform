import uuid

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    usuario_nombre: Mapped[str | None] = mapped_column(String(150), nullable=True)
    accion: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entidad_tipo: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    entidad_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    entidad_nombre: Mapped[str | None] = mapped_column(String(250), nullable=True)
    detalle: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    usuario: Mapped["User"] = relationship("User", foreign_keys=[usuario_id], lazy="select")  # type: ignore[name-defined]
