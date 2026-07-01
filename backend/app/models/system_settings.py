"""
Modelo SQLAlchemy: SystemSettings (singleton — siempre un único registro).
"""
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, Numeric, String, Text, Uuid, func
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

    # Localización
    loc_timezone: Mapped[str] = mapped_column(String(60), nullable=False, default="UTC")
    loc_locale: Mapped[str] = mapped_column(String(10), nullable=False, default="es")
    loc_currency_code: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    loc_currency_symbol: Mapped[str] = mapped_column(String(5), nullable=False, default="$")
    loc_date_format: Mapped[str] = mapped_column(String(20), nullable=False, default="DD/MM/YYYY")

    # Fiscal
    fiscal_tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    fiscal_tax_name: Mapped[str] = mapped_column(String(20), nullable=False, default="ITBIS")
    fiscal_invoice_prefix: Mapped[str] = mapped_column(String(20), nullable=False, default="FAC-")
    fiscal_invoice_next_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Notificaciones (SMTP — solo configuración, sin envío real en esta fase)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True, default=587)
    smtp_user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    smtp_from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_from_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_notifications_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Seguridad
    sec_password_min_length: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    sec_password_expiration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sec_default_session_timeout_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    sec_max_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    sec_lockout_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    sec_ip_whitelist: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Mantenimiento
    maint_audit_log_retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    maint_maintenance_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    maint_maintenance_message: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Integraciones (pasarela de pago)
    pg_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pg_api_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Facturación (migrado desde localStorage wisp_billing_*)
    billing_hora_generacion: Mapped[str] = mapped_column(String(5), nullable=False, default="08:00")
    billing_ciclo: Mapped[str] = mapped_column(String(20), nullable=False, default="mensual")
    billing_modo_precio: Mapped[str] = mapped_column(String(20), nullable=False, default="incluido")
    billing_auto_aprobar_enviar: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    billing_detener_suspendidos: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    billing_notify_new_invoice: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    billing_attach_pdf_receipt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    billing_default_dia_pago: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    billing_default_dias_gracia: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    billing_aviso_nueva_factura: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    billing_aviso_previo_dias: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    billing_recordatorios_pago: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    billing_recordatorio_frecuencia_dias: Mapped[int] = mapped_column(Integer, nullable=False, default=3)

    # Suspensión (migrado desde localStorage wisp_suspension_*)
    suspension_automatica: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suspension_hora: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    suspension_retraso_dias: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    suspension_permitir_aplazamiento: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suspension_notify_suspendido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suspension_notify_pospuesto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suspension_motivos: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Catálogos (migrado desde localStorage)
    payment_methods: Mapped[list | None] = mapped_column(JSON, nullable=True)
    fechas_corte: Mapped[list | None] = mapped_column(JSON, nullable=True)
    colas_padre: Mapped[list | None] = mapped_column(JSON, nullable=True)
    address_lists: Mapped[list | None] = mapped_column(JSON, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<SystemSettings timeout={self.mikrotik_timeout} ssl={self.mikrotik_ssl}>"
