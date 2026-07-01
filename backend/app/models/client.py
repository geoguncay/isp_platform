"""
Modelo SQLAlchemy: Client
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Uuid, func, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


client_custom_services_association = Table(
    "client_custom_services",
    Base.metadata,
    Column("cliente_id", Uuid(native_uuid=False), ForeignKey("clients.id", ondelete="CASCADE"), primary_key=True),
    Column("custom_service_id", Uuid(native_uuid=False), ForeignKey("custom_services.id", ondelete="CASCADE"), primary_key=True),
)


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    apellidos: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    nombres: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    cedula: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(40), nullable=True)
    direccion: Mapped[str] = mapped_column(String(255), nullable=False)
    latitud: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitud: Mapped[float | None] = mapped_column(Float, nullable=True)
    gateway_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("gateways.id"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="static")  # "static" o "pppoe"
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    inicio_facturacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dia_inicio_periodo: Mapped[int] = mapped_column(default=1)
    crear_factura_anticipo_dias: Mapped[int] = mapped_column(default=0)
    tipo_facturacion: Mapped[str] = mapped_column(String(20), default="forward")
    auto_aplicar_pago: Mapped[bool] = mapped_column(Boolean, default=True)
    usar_credito_auto: Mapped[bool] = mapped_column(Boolean, default=True)
    prorrateo_separado: Mapped[bool] = mapped_column(Boolean, default=True)
    suspension_programada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    gateway = relationship("Gateway")
    client_plans = relationship("ClientPlan", back_populates="client", cascade="all, delete-orphan")
    static_ip = relationship("StaticIP", back_populates="client", uselist=False, cascade="all, delete-orphan")
    pppoe_secret = relationship("PPPoESecret", back_populates="client", uselist=False, cascade="all, delete-orphan")
    payments = relationship("ClientPayment", back_populates="client", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="client", cascade="all, delete-orphan")
    tickets = relationship("ClientTicket", back_populates="client", cascade="all, delete-orphan")
    custom_services = relationship("CustomService", secondary=client_custom_services_association)
    inventory_items = relationship("ClientInventoryItem", back_populates="client", cascade="all, delete-orphan")

    @property
    def router(self):
        return self.gateway

    @router.setter
    def router(self, value) -> None:
        self.gateway = value

    @property
    def router_id(self) -> uuid.UUID:
        return self.gateway_id

    @router_id.setter
    def router_id(self, value: uuid.UUID) -> None:
        self.gateway_id = value


    @property
    def site_id(self) -> uuid.UUID | None:
        return self.gateway.site_id if self.gateway else None

    @property
    def site_nombre(self) -> str | None:
        return self.gateway.site.nombre if (self.gateway and self.gateway.site) else None

    def __repr__(self) -> str:
        return f"<Client id={self.id} nombre={self.nombre} cedula={self.cedula}>"

