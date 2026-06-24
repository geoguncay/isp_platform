"""
GatewayPool: pool de conexiones librouteros por router_id.
Mantiene máximo 2 conexiones simultáneas por router (límite RouterOS).
"""
import asyncio
import logging
from contextlib import contextmanager
from typing import Generator

import librouteros
from librouteros import connect
from librouteros.api import Api

from app.core.security import decrypt_secret
from app.models.gateway import Gateway

logger = logging.getLogger(__name__)

# Límite de conexiones simultáneas por router (restricción RouterOS)
MAX_CONNECTIONS_PER_ROUTER = 2


class GatewayConnectionError(Exception):
    """Error al conectar a un router MikroTik."""
    pass


class GatewayPool:
    """
    Singleton que administra conexiones activas a routers MikroTik.
    Usa un asyncio.Semaphore por router para limitar concurrencia.
    """

    _instance: "GatewayPool | None" = None

    def __new__(cls) -> "GatewayPool":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._semaphores: dict[str, asyncio.Semaphore] = {}
            cls._instance._active_connections: dict[str, Api] = {}
        return cls._instance

    def _get_semaphore(self, router_id: str) -> asyncio.Semaphore:
        if router_id not in self._semaphores:
            self._semaphores[router_id] = asyncio.Semaphore(MAX_CONNECTIONS_PER_ROUTER)
        return self._semaphores[router_id]

    @contextmanager
    def connect_to(self, gateway: Gateway) -> Generator[Api, None, None]:
        """
        Context manager síncrono que devuelve una conexión activa al router.
        Descifra la contraseña con Fernet antes de conectar.
        Lanza GatewayConnectionError si falla la conexión.
        """
        password = decrypt_secret(gateway.password_enc)
        api: Api | None = None
        try:
            api = connect(
                host=gateway.ip,
                username=gateway.usuario_api,
                password=password,
                port=gateway.puerto_api,
                timeout=10,
                encoding="utf-8",
            )
            logger.info(f"Conexión establecida a router {gateway.nombre} ({gateway.ip})")
            yield api
        except librouteros.exceptions.TrapError as e:
            logger.warning(f"TrapError conectando a {gateway.nombre}: {e}")
            raise GatewayConnectionError(f"Error de autenticación en {gateway.nombre}: {e}") from e
        except OSError as e:
            logger.warning(f"OSError conectando a {gateway.nombre}: {e}")
            raise GatewayConnectionError(
                f"No se puede alcanzar {gateway.nombre} ({gateway.ip}:{gateway.puerto_api}): {e}"
            ) from e
        except Exception as e:
            logger.error(f"Error inesperado conectando a {gateway.nombre}: {e}")
            raise GatewayConnectionError(f"Error inesperado: {e}") from e
        finally:
            if api is not None:
                try:
                    api.close()
                except Exception:
                    pass


# Singleton global
gateway_pool = GatewayPool()
router_pool = gateway_pool  # Fallback compatibility

