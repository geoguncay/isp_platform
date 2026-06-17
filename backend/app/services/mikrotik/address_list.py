"""
Servicio MikroTik para gestionar direcciones IP en el firewall address-list.
"""
import logging
from app.models.router import Router
from app.services.mikrotik.router_pool import router_pool
from librouteros.query import Key

logger = logging.getLogger(__name__)


def sync_ip_in_address_list(router: Router, ip: str, client_name: str) -> None:
    """
    Sincroniza una IP estática en la lista de firewall 'clientes' de MikroTik.
    Crea la entrada si no existe, o actualiza el comentario si difiere.
    """
    try:
        with router_pool.connect_to(router) as api:
            list_key = Key('list')
            address_key = Key('address')
            query = api.path('/ip/firewall/address-list').select().where(
                list_key == 'clientes',
                address_key == ip
            )
            existing = list(query)
            if existing:
                entry = existing[0]
                entry_id = entry.get(".id")
                # Si el comentario cambió, actualizarlo
                if entry.get("comment") != client_name:
                    api("/ip/firewall/address-list/set", **{".id": entry_id, "comment": client_name})
                    logger.info(f"Comentario actualizado para IP {ip} en {router.nombre}: {client_name}")
            else:
                api("/ip/firewall/address-list/add", list="clientes", address=ip, comment=client_name)
                logger.info(f"IP {ip} agregada a lista 'clientes' en {router.nombre}")
    except Exception as e:
        logger.error(f"Error al sincronizar IP {ip} en {router.nombre}: {e}")
        raise e


def remove_ip_from_address_list(router: Router, ip: str) -> None:
    """
    Remueve una IP de la lista de firewall 'clientes' de MikroTik.
    """
    try:
        with router_pool.connect_to(router) as api:
            list_key = Key('list')
            address_key = Key('address')
            query = api.path('/ip/firewall/address-list').select().where(
                list_key == 'clientes',
                address_key == ip
            )
            existing = list(query)
            for entry in existing:
                entry_id = entry.get(".id")
                api("/ip/firewall/address-list/remove", **{".id": entry_id})
                logger.info(f"IP {ip} removida de lista 'clientes' en {router.nombre}")
    except Exception as e:
        logger.error(f"Error al remover IP {ip} de {router.nombre}: {e}")
        raise e


def fetch_clients_from_address_list(router: Router, list_name: str = "clientes") -> list[dict]:
    """
    Obtiene todas las entradas de la lista especificada en el router.
    Retorna una lista de diccionarios con la estructura:
      [{"ip": "192.168.10.12", "comment": "Nombre Cliente"}]
    """
    try:
        with router_pool.connect_to(router) as api:
            list_key = Key('list')
            query = api.path('/ip/firewall/address-list').select().where(
                list_key == list_name
            )
            entries = list(query)
            return [
                {
                    "ip": entry.get("address"),
                    "comment": entry.get("comment", ""),
                }
                for entry in entries
                if entry.get("address")
            ]
    except Exception as e:
        logger.error(f"Error al obtener clientes de la lista {list_name} en {router.nombre}: {e}")
        raise e
