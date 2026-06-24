"""
Servicio de health check para routers MikroTik.
Consulta estado en tiempo real y cachea resultado en Redis.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.core.redis import GATEWAY_HEALTH_PREFIX, ROUTER_STATUS_TTL, redis_client
from app.models.gateway import Gateway
from app.schemas.gateway import GatewayStatus
from app.services.mikrotik.gateway_pool import GatewayConnectionError, gateway_pool

logger = logging.getLogger(__name__)


async def check_gateway_health(gateway: Gateway) -> GatewayStatus:
    """
    Conecta al router, obtiene versión ROS e interfaces, cachea en Redis.
    No lanza excepciones — siempre devuelve un GatewayStatus.
    """
    now = datetime.now(timezone.utc)
    cache_key = f"{GATEWAY_HEALTH_PREFIX}{gateway.id}"

    try:
        ros_version: str | None = None
        uptime: str | None = None
        interfaces: list[dict[str, Any]] = []

        with gateway_pool.connect_to(gateway) as api:
            # Versión RouterOS y uptime
            sys_resource = list(api("/system/resource/print"))
            if sys_resource:
                resource = sys_resource[0]
                ros_version = resource.get("version")
                uptime = resource.get("uptime")

            # Interfaces
            iface_list = list(api("/interface/print"))
            interfaces = [
                {
                    "name": iface.get("name"),
                    "type": iface.get("type"),
                    "running": iface.get("running") == "true" or iface.get("running") is True,
                    "disabled": iface.get("disabled") == "true" or iface.get("disabled") is True,
                    "rx_byte": iface.get("rx-byte"),
                    "tx_byte": iface.get("tx-byte"),
                }
                for iface in iface_list[:20]  # máximo 20 interfaces
            ]

        status = GatewayStatus(
            gateway_id=gateway.id,
            status="online",
            ip=gateway.ip,
            uptime=uptime,
            ros_version=ros_version,
            interfaces=interfaces,
            error=None,
            checked_at=now,
        )

    except GatewayConnectionError as e:
        logger.warning(f"Router {gateway.nombre} offline: {e}")
        status = GatewayStatus(
            gateway_id=gateway.id,
            status="offline",
            ip=gateway.ip,
            error=str(e),
            checked_at=now,
        )

    # Cachear en Redis
    await redis_client.setex(
        cache_key,
        ROUTER_STATUS_TTL,
        status.model_dump_json(),
    )

    return status


async def get_cached_gateway_status(gateway_id: str) -> GatewayStatus | None:
    """Lee el estado cacheado de Redis. Devuelve None si no hay caché."""
    data = await redis_client.get(f"{GATEWAY_HEALTH_PREFIX}{gateway_id}")
    if data is None:
        return None
    return GatewayStatus.model_validate_json(data)


# Compatibility aliases for legacy code
RouterStatus = GatewayStatus
check_router_health = check_gateway_health
get_cached_router_status = get_cached_gateway_status

