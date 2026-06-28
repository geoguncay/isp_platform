"""
Modelo SQLAlchemy: SystemSettings (singleton — siempre un único registro).
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )

    # MikroTik API
    mikrotik_timeout: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    mikrotik_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    mikrotik_debug: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mikrotik_ssl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<SystemSettings timeout={self.mikrotik_timeout} ssl={self.mikrotik_ssl}>"
