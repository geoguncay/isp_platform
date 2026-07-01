"""
Endpoints para configuración global del sistema (SystemSettings).
"""
import os
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.database import _is_sqlite
from app.core.deps import AdminOnly, DBSession
from app.core.security import encrypt_secret
from app.models.system_settings import SystemSettings
from app.schemas.system_settings import (
    BackupResult,
    BillingSettings,
    BillingSettingsRead,
    CatalogSettings,
    CatalogSettingsRead,
    FiscalSettings,
    FiscalSettingsRead,
    IntegrationSettings,
    IntegrationSettingsRead,
    LocalizationSettings,
    LocalizationSettingsRead,
    MaintenanceSettings,
    MaintenanceSettingsRead,
    MikrotikApiConfig,
    MikrotikApiConfigRead,
    SecuritySettings,
    SecuritySettingsRead,
    SmtpSettings,
    SmtpSettingsRead,
    SuspensionSettings,
    SuspensionSettingsRead,
    SystemSettingsRead,
)
from app.services.audit_service import AuditAction, log_event
from app.services.mikrotik.gateway_pool import gateway_pool

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create(db) -> SystemSettings:
    cfg = db.query(SystemSettings).first()
    if not cfg:
        cfg = SystemSettings()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/mikrotik-api", response_model=MikrotikApiConfigRead)
def get_mikrotik_api_config(db: DBSession, _: AdminOnly) -> SystemSettings:
    return _get_or_create(db)


@router.put("/mikrotik-api", response_model=MikrotikApiConfigRead)
def update_mikrotik_api_config(
    payload: MikrotikApiConfig,
    db: DBSession,
    _: AdminOnly,
) -> SystemSettings:
    cfg = _get_or_create(db)
    cfg.mikrotik_timeout = payload.mikrotik_timeout
    cfg.mikrotik_attempts = payload.mikrotik_attempts
    cfg.mikrotik_debug = payload.mikrotik_debug
    cfg.mikrotik_ssl = payload.mikrotik_ssl
    db.commit()
    db.refresh(cfg)
    gateway_pool.invalidate_config_cache()
    return cfg


# ── Lectura agregada de Ajustes de Sistema ──────────────────────────────────
def _to_smtp_read(cfg: SystemSettings) -> SmtpSettingsRead:
    return SmtpSettingsRead(
        smtp_host=cfg.smtp_host,
        smtp_port=cfg.smtp_port,
        smtp_user=cfg.smtp_user,
        smtp_password_set=bool(cfg.smtp_password_encrypted),
        smtp_from_email=cfg.smtp_from_email,
        smtp_from_name=cfg.smtp_from_name,
        smtp_use_tls=cfg.smtp_use_tls,
        sms_notifications_enabled=cfg.sms_notifications_enabled,
    )


def _to_security_read(cfg: SystemSettings) -> SecuritySettingsRead:
    return SecuritySettingsRead(
        sec_password_min_length=cfg.sec_password_min_length,
        sec_password_expiration_days=cfg.sec_password_expiration_days,
        sec_default_session_timeout_minutes=cfg.sec_default_session_timeout_minutes,
        sec_max_login_attempts=cfg.sec_max_login_attempts,
        sec_lockout_duration_minutes=cfg.sec_lockout_duration_minutes,
        sec_ip_whitelist=cfg.sec_ip_whitelist or [],
    )


def _to_integrations_read(cfg: SystemSettings) -> IntegrationSettingsRead:
    return IntegrationSettingsRead(
        pg_api_key=cfg.pg_api_key,
        pg_api_secret_set=bool(cfg.pg_api_secret_encrypted),
    )


def _to_suspension_read(cfg: SystemSettings) -> SuspensionSettingsRead:
    return SuspensionSettingsRead(
        suspension_automatica=cfg.suspension_automatica,
        suspension_hora=cfg.suspension_hora,
        suspension_retraso_dias=cfg.suspension_retraso_dias,
        suspension_permitir_aplazamiento=cfg.suspension_permitir_aplazamiento,
        suspension_notify_suspendido=cfg.suspension_notify_suspendido,
        suspension_notify_pospuesto=cfg.suspension_notify_pospuesto,
        suspension_motivos=cfg.suspension_motivos or [],
    )


def _to_catalogs_read(cfg: SystemSettings) -> CatalogSettingsRead:
    return CatalogSettingsRead(
        payment_methods=cfg.payment_methods or [],
        fechas_corte=cfg.fechas_corte or [],
        colas_padre=cfg.colas_padre or [],
        address_lists=cfg.address_lists or [],
    )


@router.get("/system", response_model=SystemSettingsRead)
def get_system_settings(db: DBSession, _: AdminOnly) -> SystemSettingsRead:
    cfg = _get_or_create(db)
    return SystemSettingsRead(
        localization=LocalizationSettingsRead.model_validate(cfg),
        fiscal=FiscalSettingsRead.model_validate(cfg),
        notifications=_to_smtp_read(cfg),
        security=_to_security_read(cfg),
        maintenance=MaintenanceSettingsRead.model_validate(cfg),
        integrations=_to_integrations_read(cfg),
        billing=BillingSettingsRead.model_validate(cfg),
        suspension=_to_suspension_read(cfg),
        catalogs=_to_catalogs_read(cfg),
        updated_at=cfg.updated_at,
    )


@router.put("/system/localization", response_model=LocalizationSettingsRead)
def update_localization_settings(
    payload: LocalizationSettings, db: DBSession, current_user: AdminOnly
) -> LocalizationSettingsRead:
    cfg = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_LOCALIZATION_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return LocalizationSettingsRead.model_validate(cfg)


@router.put("/system/fiscal", response_model=FiscalSettingsRead)
def update_fiscal_settings(
    payload: FiscalSettings, db: DBSession, current_user: AdminOnly
) -> FiscalSettingsRead:
    cfg = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_FISCAL_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return FiscalSettingsRead.model_validate(cfg)


@router.put("/system/notifications", response_model=SmtpSettingsRead)
def update_notification_settings(
    payload: SmtpSettings, db: DBSession, current_user: AdminOnly
) -> SmtpSettingsRead:
    cfg = _get_or_create(db)
    data = payload.model_dump(exclude_unset=True, exclude={"smtp_password"})
    for field, value in data.items():
        setattr(cfg, field, value)
    if "smtp_password" in payload.model_fields_set:
        cfg.smtp_password_encrypted = (
            encrypt_secret(payload.smtp_password) if payload.smtp_password else None
        )
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_SMTP_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return _to_smtp_read(cfg)


@router.put("/system/security", response_model=SecuritySettingsRead)
def update_security_settings(
    payload: SecuritySettings, db: DBSession, current_user: AdminOnly
) -> SecuritySettingsRead:
    cfg = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_SECURITY_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return _to_security_read(cfg)


@router.put("/system/maintenance", response_model=MaintenanceSettingsRead)
def update_maintenance_settings(
    payload: MaintenanceSettings, db: DBSession, current_user: AdminOnly
) -> MaintenanceSettingsRead:
    cfg = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_MAINTENANCE_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return MaintenanceSettingsRead.model_validate(cfg)


@router.put("/system/integrations", response_model=IntegrationSettingsRead)
def update_integration_settings(
    payload: IntegrationSettings, db: DBSession, current_user: AdminOnly
) -> IntegrationSettingsRead:
    cfg = _get_or_create(db)
    if "pg_api_key" in payload.model_fields_set:
        cfg.pg_api_key = payload.pg_api_key
    if "pg_api_secret" in payload.model_fields_set:
        cfg.pg_api_secret_encrypted = (
            encrypt_secret(payload.pg_api_secret) if payload.pg_api_secret else None
        )
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_INTEGRATION_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return _to_integrations_read(cfg)


@router.put("/system/billing", response_model=BillingSettingsRead)
def update_billing_settings(
    payload: BillingSettings, db: DBSession, current_user: AdminOnly
) -> BillingSettingsRead:
    cfg = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_BILLING_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return BillingSettingsRead.model_validate(cfg)


@router.put("/system/suspension", response_model=SuspensionSettingsRead)
def update_suspension_settings(
    payload: SuspensionSettings, db: DBSession, current_user: AdminOnly
) -> SuspensionSettingsRead:
    cfg = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_SUSPENSION_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return _to_suspension_read(cfg)


@router.put("/system/catalogs", response_model=CatalogSettingsRead)
def update_catalog_settings(
    payload: CatalogSettings, db: DBSession, current_user: AdminOnly
) -> CatalogSettingsRead:
    cfg = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_CATALOG_SETTINGS,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
    )
    return _to_catalogs_read(cfg)


@router.post("/system/backup", response_model=BackupResult)
def run_manual_backup(db: DBSession, current_user: AdminOnly) -> BackupResult:
    if _is_sqlite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El backup manual requiere PostgreSQL; la base actual es SQLite.",
        )
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    created_at = datetime.now(timezone.utc)
    filename = f"isp_backup_{created_at.strftime('%Y%m%d_%H%M%S')}.sql"
    file_path = os.path.join(settings.BACKUP_DIR, filename)
    try:
        result = subprocess.run(
            ["pg_dump", settings.DATABASE_URL, "-f", file_path],
            capture_output=True, text=True, timeout=300,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="pg_dump no está disponible en el servidor.",
        )
    if result.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar el backup: {result.stderr.strip()}",
        )
    size_bytes = os.path.getsize(file_path)
    log_event(
        db, AuditAction.SYSTEM_BACKUP,
        entidad_tipo="SystemSettings",
        usuario_id=current_user.id, usuario_nombre=current_user.nombre,
        detalle={"filename": filename, "size_bytes": size_bytes},
    )
    return BackupResult(filename=filename, size_bytes=size_bytes, created_at=created_at)
