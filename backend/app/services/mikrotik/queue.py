"""
Servicio MikroTik para gestionar colas de ancho de banda (Simple Queues).
"""
import logging
from app.models.router import Router
from app.services.mikrotik.router_pool import router_pool
from librouteros.query import Key

logger = logging.getLogger(__name__)


def get_or_create_parent_queue(api) -> str:
    """
    Busca o crea una cola simple padre llamada 'PADRE' o 'total'.
    Retorna el nombre de la cola padre encontrada o creada.
    """
    try:
        # 1. Buscar cola llamada 'PADRE'
        query_padre = api.path('/queue/simple').select().where(Key('name') == 'PADRE')
        existing = list(query_padre)
        if existing:
            return 'PADRE'

        # 2. Buscar cola llamada 'total'
        query_total = api.path('/queue/simple').select().where(Key('name') == 'total')
        existing_total = list(query_total)
        if existing_total:
            return 'total'

        # 3. Si ninguna existe, crear 'PADRE'
        logger.info("No se encontró cola padre. Creando cola padre 'PADRE' en el router...")
        api("/queue/simple/add", name="PADRE", target="0.0.0.0/0", **{"max-limit": "0/0"})
        return 'PADRE'
    except Exception as e:
        logger.error(f"Error al buscar o crear cola padre: {e}")
        # En caso de error, retornamos 'none' o vacío para intentar agregar la cola de todas formas sin padre
        return 'none'


def sync_client_queue(
    router: Router,
    client_name: str,
    ip: str,
    speed_up: int,
    speed_down: int,
    plan_name: str
) -> None:
    """
    Sincroniza la cola simple de un cliente en MikroTik.
    Busca por target IP o por nombre del cliente para crearla o actualizarla.
    """
    target_ip = f"{ip}/32"
    max_limit = f"{speed_up}M/{speed_down}M"

    try:
        with router_pool.connect_to(router) as api:
            parent_name = get_or_create_parent_queue(api)
            
            # Buscar por target IP
            query_target = api.path('/queue/simple').select().where(Key('target') == target_ip)
            existing = list(query_target)
            
            # Si no se encuentra por IP, intentar por nombre
            if not existing:
                query_name = api.path('/queue/simple').select().where(Key('name') == client_name)
                existing = list(query_name)

            params = {
                "name": client_name,
                "target": target_ip,
                "max-limit": max_limit,
                "comment": plan_name,
                "disabled": False
            }
            # Solo añadir el parent si es válido y no es 'none'
            if parent_name and parent_name != 'none':
                params["parent"] = parent_name

            if existing:
                entry = existing[0]
                entry_id = entry.get(".id")
                # Actualizar cola existente
                api("/queue/simple/set", **{".id": entry_id, **params})
                logger.info(f"Cola simple actualizada en {router.nombre} para cliente {client_name} (IP: {ip}, Límite: {max_limit})")
            else:
                # Crear nueva cola simple
                api("/queue/simple/add", **params)
                logger.info(f"Cola simple creada en {router.nombre} para cliente {client_name} (IP: {ip}, Límite: {max_limit})")

    except Exception as e:
        logger.error(f"Error al sincronizar cola simple para IP {ip} en {router.nombre}: {e}")
        raise e


def remove_client_queue(router: Router, ip: str) -> None:
    """
    Remueve la cola simple de un cliente en MikroTik basándose en su target IP.
    """
    target_ip = f"{ip}/32"
    try:
        with router_pool.connect_to(router) as api:
            query = api.path('/queue/simple').select().where(Key('target') == target_ip)
            existing = list(query)
            for entry in existing:
                entry_id = entry.get(".id")
                api("/queue/simple/remove", **{".id": entry_id})
                logger.info(f"Cola simple para IP {ip} removida en {router.nombre}")
    except Exception as e:
        logger.error(f"Error al remover cola simple para IP {ip} en {router.nombre}: {e}")
        raise e


def toggle_client_queue(router: Router, ip: str, disabled: bool) -> None:
    """
    Habilita o desactiva la cola simple de un cliente en MikroTik basándose en su target IP.
    """
    target_ip = f"{ip}/32"
    try:
        with router_pool.connect_to(router) as api:
            query = api.path('/queue/simple').select().where(Key('target') == target_ip)
            existing = list(query)
            for entry in existing:
                entry_id = entry.get(".id")
                api("/queue/simple/set", **{".id": entry_id, "disabled": disabled})
                logger.info(f"Cola simple para IP {ip} {'deshabilitada' if disabled else 'habilitada'} en {router.nombre}")
    except Exception as e:
        logger.error(f"Error al cambiar estado de cola simple para IP {ip} en {router.nombre}: {e}")
        raise e


def fetch_queues(router: Router) -> list[dict]:
    """
    Obtiene la lista completa de colas simples del router MikroTik.
    """
    try:
        with router_pool.connect_to(router) as api:
            queues = list(api.path('/queue/simple'))
            return [
                {
                    "id": q.get(".id"),
                    "name": q.get("name"),
                    "target": q.get("target"),
                    "max_limit": q.get("max-limit"),
                    "rate": q.get("rate", "0/0"),
                    "parent": q.get("parent"),
                    "comment": q.get("comment", ""),
                    "disabled": q.get("disabled") == "true" or q.get("disabled") is True,
                }
                for q in queues
            ]
    except Exception as e:
        logger.error(f"Error al obtener colas del router {router.nombre}: {e}")
        raise e
