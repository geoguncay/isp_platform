"""
Schemas Pydantic: SystemSettings.
"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class MikrotikApiConfig(BaseModel):
    mikrotik_timeout: int = Field(default=10, ge=1, le=120)
    mikrotik_attempts: int = Field(default=1, ge=1, le=10)
    mikrotik_debug: bool = False
    mikrotik_ssl: bool = False


class MikrotikApiConfigRead(MikrotikApiConfig):
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Localización ────────────────────────────────────────────────────────────
class LocalizationSettings(BaseModel):
    loc_timezone: str | None = Field(default=None, max_length=60)
    loc_locale: str | None = Field(default=None, max_length=10)
    loc_currency_code: str | None = Field(default=None, max_length=10)
    loc_currency_symbol: str | None = Field(default=None, max_length=5)
    loc_date_format: str | None = Field(default=None, max_length=20)


class LocalizationSettingsRead(BaseModel):
    model_config = {"from_attributes": True}

    loc_timezone: str
    loc_locale: str
    loc_currency_code: str
    loc_currency_symbol: str
    loc_date_format: str


# ── Fiscal ──────────────────────────────────────────────────────────────────
class FiscalSettings(BaseModel):
    fiscal_tax_rate: float | None = Field(default=None, ge=0, le=100)
    fiscal_tax_name: str | None = Field(default=None, max_length=20)
    fiscal_invoice_prefix: str | None = Field(default=None, max_length=20)
    fiscal_invoice_next_number: int | None = Field(default=None, ge=1)


class FiscalSettingsRead(BaseModel):
    model_config = {"from_attributes": True}

    fiscal_tax_rate: float
    fiscal_tax_name: str
    fiscal_invoice_prefix: str
    fiscal_invoice_next_number: int


# ── Notificaciones (SMTP — solo configuración, sin envío real aún) ──────────
class SmtpSettings(BaseModel):
    smtp_host: str | None = Field(default=None, max_length=255)
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_user: str | None = Field(default=None, max_length=255)
    smtp_password: str | None = Field(default=None, max_length=255)
    smtp_from_email: EmailStr | None = None
    smtp_from_name: str | None = Field(default=None, max_length=120)
    smtp_use_tls: bool | None = None
    sms_notifications_enabled: bool | None = None


class SmtpSettingsRead(BaseModel):
    smtp_host: str | None
    smtp_port: int | None
    smtp_user: str | None
    smtp_password_set: bool
    smtp_from_email: str | None
    smtp_from_name: str | None
    smtp_use_tls: bool
    sms_notifications_enabled: bool


# ── Seguridad ───────────────────────────────────────────────────────────────
class SecuritySettings(BaseModel):
    sec_password_min_length: int | None = Field(default=None, ge=4, le=64)
    sec_password_expiration_days: int | None = Field(default=None, ge=0, le=3650)
    sec_default_session_timeout_minutes: int | None = Field(default=None, ge=1, le=1440)
    sec_max_login_attempts: int | None = Field(default=None, ge=1, le=20)
    sec_lockout_duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    sec_ip_whitelist: list[str] | None = None


class SecuritySettingsRead(BaseModel):
    sec_password_min_length: int
    sec_password_expiration_days: int
    sec_default_session_timeout_minutes: int
    sec_max_login_attempts: int
    sec_lockout_duration_minutes: int
    sec_ip_whitelist: list[str]


# ── Mantenimiento ───────────────────────────────────────────────────────────
class MaintenanceSettings(BaseModel):
    maint_audit_log_retention_days: int | None = Field(default=None, ge=1, le=3650)
    maint_maintenance_mode: bool | None = None
    maint_maintenance_message: str | None = Field(default=None, max_length=500)


class MaintenanceSettingsRead(BaseModel):
    model_config = {"from_attributes": True}

    maint_audit_log_retention_days: int
    maint_maintenance_mode: bool
    maint_maintenance_message: str | None


class BackupResult(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime


# ── Integraciones (pasarela de pago) ────────────────────────────────────────
class IntegrationSettings(BaseModel):
    pg_api_key: str | None = Field(default=None, max_length=255)
    pg_api_secret: str | None = Field(default=None, max_length=255)


class IntegrationSettingsRead(BaseModel):
    pg_api_key: str | None
    pg_api_secret_set: bool


# ── Facturación (migrado desde localStorage wisp_billing_*) ────────────────
class BillingSettings(BaseModel):
    billing_hora_generacion: str | None = Field(default=None, max_length=5)
    billing_ciclo: str | None = Field(default=None, max_length=20)
    billing_modo_precio: str | None = Field(default=None, max_length=20)
    billing_auto_aprobar_enviar: bool | None = None
    billing_detener_suspendidos: bool | None = None
    billing_notify_new_invoice: bool | None = None
    billing_attach_pdf_receipt: bool | None = None
    billing_default_dia_pago: int | None = Field(default=None, ge=1, le=28)
    billing_default_dias_gracia: int | None = Field(default=None, ge=0, le=90)
    billing_aviso_nueva_factura: bool | None = None
    billing_aviso_previo_dias: int | None = Field(default=None, ge=0, le=90)
    billing_recordatorios_pago: bool | None = None
    billing_recordatorio_frecuencia_dias: int | None = Field(default=None, ge=1, le=90)


class BillingSettingsRead(BaseModel):
    model_config = {"from_attributes": True}

    billing_hora_generacion: str
    billing_ciclo: str
    billing_modo_precio: str
    billing_auto_aprobar_enviar: bool
    billing_detener_suspendidos: bool
    billing_notify_new_invoice: bool
    billing_attach_pdf_receipt: bool
    billing_default_dia_pago: int
    billing_default_dias_gracia: int
    billing_aviso_nueva_factura: bool
    billing_aviso_previo_dias: int
    billing_recordatorios_pago: bool
    billing_recordatorio_frecuencia_dias: int


# ── Suspensión (migrado desde localStorage wisp_suspension_*) ──────────────
class SuspensionSettings(BaseModel):
    suspension_automatica: bool | None = None
    suspension_hora: int | None = Field(default=None, ge=0, le=23)
    suspension_retraso_dias: int | None = Field(default=None, ge=0, le=90)
    suspension_permitir_aplazamiento: bool | None = None
    suspension_notify_suspendido: bool | None = None
    suspension_notify_pospuesto: bool | None = None
    suspension_motivos: list[str] | None = None


class SuspensionSettingsRead(BaseModel):
    suspension_automatica: bool
    suspension_hora: int
    suspension_retraso_dias: int
    suspension_permitir_aplazamiento: bool
    suspension_notify_suspendido: bool
    suspension_notify_pospuesto: bool
    suspension_motivos: list[str]


# ── Catálogos (métodos de pago, fechas de corte, colas padre, address lists) ─
class CatalogSettings(BaseModel):
    payment_methods: list[dict] | None = None
    fechas_corte: list[int] | None = None
    colas_padre: list[str] | None = None
    address_lists: list[str] | None = None


class CatalogSettingsRead(BaseModel):
    payment_methods: list[dict]
    fechas_corte: list[int]
    colas_padre: list[str]
    address_lists: list[str]


# ── Agregado para GET /settings/system ──────────────────────────────────────
class SystemSettingsRead(BaseModel):
    localization: LocalizationSettingsRead
    fiscal: FiscalSettingsRead
    notifications: SmtpSettingsRead
    security: SecuritySettingsRead
    maintenance: MaintenanceSettingsRead
    integrations: IntegrationSettingsRead
    billing: BillingSettingsRead
    suspension: SuspensionSettingsRead
    catalogs: CatalogSettingsRead
    updated_at: datetime
