"""
Celery application y tareas programadas (Beat).
"""
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "isp_platform",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.health_check"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Guayaquil",
    enable_utc=True,
    task_track_started=True,
    worker_redirect_stdouts_level="INFO",
    beat_schedule={
        # Health check de todos los routers cada 60 segundos
        "check-all-routers-health": {
            "task": "app.workers.health_check.check_all_routers",
            "schedule": 60.0,  # segundos
        },
    },
)
