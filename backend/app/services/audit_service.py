"""
Servicio de auditoría: registra eventos del sistema ISP en la tabla audit_logs.
"""
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# ── Acciones estándar ────────────────────────────────────────────────────────
class AuditAction:
    # Auth
    USER_LOGIN = "USER_LOGIN"

    # Gateways
    CREATE_GATEWAY = "CREATE_GATEWAY"
    UPDATE_GATEWAY = "UPDATE_GATEWAY"
    DELETE_GATEWAY = "DELETE_GATEWAY"
    GATEWAY_ONLINE = "GATEWAY_ONLINE"
    GATEWAY_OFFLINE = "GATEWAY_OFFLINE"
    IMPORT_CLIENTS = "IMPORT_CLIENTS"

    # Clientes
    CREATE_CLIENT = "CREATE_CLIENT"
    UPDATE_CLIENT = "UPDATE_CLIENT"
    DELETE_CLIENT = "DELETE_CLIENT"
    SUSPEND_CLIENT = "SUSPEND_CLIENT"
    ACTIVATE_CLIENT = "ACTIVATE_CLIENT"

    # Planes y colas
    ASSIGN_PLAN = "ASSIGN_PLAN"
    TOGGLE_QUEUE = "TOGGLE_QUEUE"

    # Pagos
    CREATE_PAYMENT = "CREATE_PAYMENT"

    # Ajustes de Sistema
    UPDATE_LOCALIZATION_SETTINGS = "UPDATE_LOCALIZATION_SETTINGS"
    UPDATE_FISCAL_SETTINGS = "UPDATE_FISCAL_SETTINGS"
    UPDATE_SMTP_SETTINGS = "UPDATE_SMTP_SETTINGS"
    UPDATE_SECURITY_SETTINGS = "UPDATE_SECURITY_SETTINGS"
    UPDATE_MAINTENANCE_SETTINGS = "UPDATE_MAINTENANCE_SETTINGS"
    UPDATE_INTEGRATION_SETTINGS = "UPDATE_INTEGRATION_SETTINGS"
    UPDATE_BILLING_SETTINGS = "UPDATE_BILLING_SETTINGS"
    UPDATE_SUSPENSION_SETTINGS = "UPDATE_SUSPENSION_SETTINGS"
    UPDATE_CATALOG_SETTINGS = "UPDATE_CATALOG_SETTINGS"
    SYSTEM_BACKUP = "SYSTEM_BACKUP"


def log_event(
    db: Session,
    accion: str,
    entidad_tipo: str | None = None,
    entidad_id: Any = None,
    entidad_nombre: str | None = None,
    usuario_id: Any = None,
    usuario_nombre: str | None = None,
    detalle: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """
    Escribe un evento de auditoría en la BD.
    No lanza excepciones — los errores se registran en el log del sistema.
    """
    try:
        entry = AuditLog(
            accion=accion,
            entidad_tipo=entidad_tipo,
            entidad_id=str(entidad_id) if entidad_id is not None else None,
            entidad_nombre=entidad_nombre,
            usuario_id=usuario_id,
            usuario_nombre=usuario_nombre,
            detalle=detalle,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
    except Exception as exc:
        logger.error(f"Error al escribir audit log [{accion}]: {exc}")
        db.rollback()


def log_connectivity_change(gateway_id: str, gateway_nombre: str, accion: str) -> None:
    """
    Registra cambios de conectividad de un gateway (online/offline).
    Abre su propia sesión de BD — seguro de llamar desde Celery workers.
    """
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        log_event(
            db=db,
            accion=accion,
            entidad_tipo="Gateway",
            entidad_id=gateway_id,
            entidad_nombre=gateway_nombre,
            detalle={"source": "health_check"},
        )
    finally:
        db.close()
