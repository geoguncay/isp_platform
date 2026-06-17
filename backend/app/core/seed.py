"""
Script de seed: crea el usuario administrador inicial si no existe.
Se ejecuta al inicio de la aplicación en modo development.
"""
import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.models.plan import Plan

logger = logging.getLogger(__name__)


def seed_admin(db: Session) -> None:
    exists = db.query(User).filter(User.email == settings.ADMIN_SEED_EMAIL).first()
    if exists:
        from app.core.security import verify_password
        if not verify_password(settings.ADMIN_SEED_PASSWORD, exists.hashed_password):
            exists.hashed_password = hash_password(settings.ADMIN_SEED_PASSWORD)
            db.commit()
            logger.info(f"🔑 Contraseña del administrador actualizada según .env")
        else:
            logger.info(f"Usuario admin ya existe: {settings.ADMIN_SEED_EMAIL}")
        return

    admin = User(
        nombre=settings.ADMIN_SEED_NOMBRE,
        email=settings.ADMIN_SEED_EMAIL,
        hashed_password=hash_password(settings.ADMIN_SEED_PASSWORD),
        rol="admin",
        activo=True,
    )
    db.add(admin)
    db.commit()
    logger.info(f"✅ Usuario admin creado: {settings.ADMIN_SEED_EMAIL}")


def seed_plans(db: Session) -> None:
    default_plans = [
        {"nombre": "Plan Básico 20 Mbps", "velocidad_down_mbps": 20, "velocidad_up_mbps": 10, "precio": 15.00},
        {"nombre": "Plan Familiar 50 Mbps", "velocidad_down_mbps": 50, "velocidad_up_mbps": 25, "precio": 25.00},
        {"nombre": "Plan Corporativo 100 Mbps", "velocidad_down_mbps": 100, "velocidad_up_mbps": 50, "precio": 45.00},
    ]
    for dp in default_plans:
        exists = db.query(Plan).filter(Plan.nombre == dp["nombre"]).first()
        if not exists:
            plan = Plan(
                nombre=dp["nombre"],
                velocidad_down_mbps=dp["velocidad_down_mbps"],
                velocidad_up_mbps=dp["velocidad_up_mbps"],
                precio=dp["precio"]
            )
            db.add(plan)
            logger.info(f"✅ Plan de ancho de banda creado: {dp['nombre']}")
    db.commit()


def run_seed() -> None:
    db = SessionLocal()
    try:
        seed_admin(db)
        seed_plans(db)
    finally:
        db.close()
