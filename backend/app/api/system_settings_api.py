"""
Endpoints para configuración global del sistema (SystemSettings).
"""
from fastapi import APIRouter

from app.core.deps import AdminOnly, DBSession
from app.models.system_settings import SystemSettings
from app.schemas.system_settings import MikrotikApiConfig, MikrotikApiConfigRead
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
