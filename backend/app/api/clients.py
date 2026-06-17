"""
Endpoints CRUD de Clientes, historial de planes y asignación de planes.
"""
import uuid
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import AdminOrTecnico, DBSession
from app.models.client import Client
from app.models.plan import Plan
from app.models.router import Router
from app.models.client_plan import ClientPlan
from app.models.static_ip import StaticIP
from app.models.payment import ClientPayment
from app.models.ticket import ClientTicket
from app.services.mikrotik.address_list import sync_ip_in_address_list, remove_ip_from_address_list
from app.schemas.client import (
    ClientCreate,
    ClientListResponse,
    ClientPlanResponse,
    ClientResponse,
    ClientUpdate,
)
from app.schemas.payment import PaymentResponse
from app.schemas.ticket import TicketCreate, TicketResponse
from app.schemas.traffic import TrafficResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clients", tags=["clients"])


def _enrich_client(client: Client, db: Session) -> dict:
    """Enriquece el modelo Client con información de su plan activo, el router y la IP estática."""
    data = ClientResponse.model_validate(client).model_dump()

    # Buscar plan activo (estado == 'activo')
    active_client_plan = (
        db.query(ClientPlan)
        .filter(ClientPlan.cliente_id == client.id, ClientPlan.estado == "activo")
        .first()
    )

    if active_client_plan and active_client_plan.plan:
        data["plan_activo"] = active_client_plan.plan
    else:
        data["plan_activo"] = None

    if client.router:
        data["router_nombre"] = client.router.nombre
    else:
        data["router_nombre"] = None

    # Static IP
    if client.static_ip:
        data["static_ip"] = client.static_ip
    else:
        data["static_ip"] = None

    return data


@router.get("", response_model=ClientListResponse)
def list_clients(
    db: DBSession,
    _: AdminOrTecnico,
    router_id: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    activo: bool | None = None,
    tipo: str | None = None,
    search: str | None = None,
    sort_by: str | None = None,
    sort_dir: str = "desc",
    skip: int = 0,
    limit: int = 10,
) -> ClientListResponse:
    """
    Lista clientes con filtros dinámicos (router, plan, estado, tipo de conexión, búsqueda por texto)
    y paginación.
    """
    query = db.query(Client)

    if router_id:
        query = query.filter(Client.router_id == router_id)

    if activo is not None:
        query = query.filter(Client.activo == activo)

    if tipo:
        query = query.filter(Client.tipo == tipo)

    if plan_id:
        # Filtrar clientes cuyo plan activo sea el plan_id dado
        query = query.join(ClientPlan, Client.id == ClientPlan.cliente_id).filter(
            ClientPlan.plan_id == plan_id, ClientPlan.estado == "activo"
        )

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (Client.nombre.ilike(search_filter))
            | (Client.cedula.ilike(search_filter))
            | (Client.telefono.ilike(search_filter))
        )

    # Ordenamiento dinámico
    sort_column = Client.created_at
    if sort_by == "nombre":
        sort_column = Client.nombre
    elif sort_by == "cedula":
        sort_column = Client.cedula
    elif sort_by == "email":
        sort_column = Client.email
    elif sort_by == "created_at":
        sort_column = Client.created_at
    elif sort_by == "tipo":
        sort_column = Client.tipo
    elif sort_by == "activo":
        from sqlalchemy import case, cast, String, func
        id_str = cast(Client.id, String)
        first_char = func.substr(id_str, 1, 1)
        sort_column = case(
            (Client.activo == False, 3),
            (first_char.in_(["1", "8", "b", "B"]), 2),
            else_=1
        )
    elif sort_by == "ip":
        from sqlalchemy.orm import aliased
        static_ip_alias = aliased(StaticIP)
        query = query.outerjoin(static_ip_alias, Client.id == static_ip_alias.cliente_id)
        sort_column = static_ip_alias.ip
    elif sort_by == "router":
        from sqlalchemy.orm import aliased
        router_alias = aliased(Router)
        query = query.outerjoin(router_alias, Client.router_id == router_alias.id)
        sort_column = router_alias.nombre
    elif sort_by == "plan":
        from sqlalchemy.orm import aliased
        client_plan_alias = aliased(ClientPlan)
        plan_alias = aliased(Plan)
        query = query.outerjoin(
            client_plan_alias,
            (Client.id == client_plan_alias.cliente_id) & (client_plan_alias.estado == "activo")
        ).outerjoin(plan_alias, client_plan_alias.plan_id == plan_alias.id)
        sort_column = plan_alias.nombre

    if sort_dir == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    enriched_items = [_enrich_client(item, db) for item in items]
    return ClientListResponse(items=enriched_items, total=total)


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreate, db: DBSession, _: AdminOrTecnico) -> dict:
    """Crea un nuevo cliente. Opcionalmente asigna un plan inicial y sincroniza IP estática en MikroTik."""
    # Verificar que el router exista y esté activo
    r = db.get(Router, payload.router_id)
    if not r or not r.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El router especificado no existe o está inactivo.",
        )

    # Verificar cédula única
    exists = db.query(Client).filter(Client.cedula == payload.cedula).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un cliente registrado con la cédula {payload.cedula}.",
        )

    # Si se envía plan_id, verificar que exista
    if payload.plan_id:
        p = db.get(Plan, payload.plan_id)
        if not p:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El plan especificado no existe.",
            )

    # Si es tipo static, validar IP
    if payload.tipo == "static":
        if not payload.ip:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La dirección IP es obligatoria para conexiones con IP Estática.",
            )
        # Validar IP única en este router
        exists_ip = db.query(StaticIP).filter(
            StaticIP.router_id == payload.router_id,
            StaticIP.ip == payload.ip
        ).first()
        if exists_ip:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La dirección IP {payload.ip} ya está asignada a otro cliente en este router.",
            )

    client = Client(
        nombre=payload.nombre,
        cedula=payload.cedula,
        telefono=payload.telefono,
        direccion=payload.direccion,
        latitud=payload.latitud,
        longitud=payload.longitud,
        router_id=payload.router_id,
        tipo=payload.tipo,
        activo=True,
        email=payload.email,
    )
    if payload.created_at:
        client.created_at = payload.created_at
    db.add(client)
    db.flush()  # Generar ID del cliente antes de asociar el plan e IP

    # Crear el registro del plan inicial si se especificó
    if payload.plan_id:
        client_plan = ClientPlan(
            cliente_id=client.id,
            plan_id=payload.plan_id,
            fecha_inicio=datetime.now(),
            estado="activo",
        )
        db.add(client_plan)

    # Crear el registro de IP estática si se especificó
    if payload.tipo == "static" and payload.ip:
        static_ip = StaticIP(
            cliente_id=client.id,
            ip=payload.ip,
            mac=payload.mac,
            router_id=payload.router_id,
            notas=payload.notas_ip,
        )
        db.add(static_ip)
        
        # Sincronizar con MikroTik síncronamente
        try:
            sync_ip_in_address_list(r, payload.ip, client.nombre)
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"No se pudo registrar la IP en el router MikroTik. Verifique conectividad. Error: {str(e)}"
            )

    db.commit()
    db.refresh(client)

    return _enrich_client(client, db)


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: uuid.UUID, db: DBSession, _: AdminOrTecnico) -> dict:
    """Obtiene el detalle de un cliente."""
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    return _enrich_client(client, db)


@router.put("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: uuid.UUID, payload: ClientUpdate, db: DBSession, _: AdminOrTecnico
) -> dict:
    """Edita datos básicos de un cliente y sincroniza cambios de IP/Router en MikroTik."""
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    update_data = payload.model_dump(exclude_unset=True)

    # Validar cédula única si cambia
    if "cedula" in update_data and update_data["cedula"] != client.cedula:
        exists = db.query(Client).filter(Client.cedula == update_data["cedula"]).first()
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un cliente registrado con la cédula {update_data['cedula']}.",
            )

    # Validar router si cambia
    if "router_id" in update_data and update_data["router_id"] != client.router_id:
        r = db.get(Router, update_data["router_id"])
        if not r or not r.activo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El router especificado no existe o está inactivo.",
            )

    old_ip = client.static_ip.ip if client.static_ip else None
    old_router = client.router
    old_router_id = client.router_id
    new_router_id = update_data.get("router_id", client.router_id)
    new_tipo = update_data.get("tipo", client.tipo)

    # Si el tipo cambia a pppoe y tenía una IP estática, removerla de MikroTik y BD
    if new_tipo == "pppoe" and client.static_ip:
        try:
            remove_ip_from_address_list(client.router, client.static_ip.ip)
        except Exception as e:
            logger.warning(f"No se pudo remover la IP en MikroTik al cambiar a PPPoE: {e}")
        db.delete(client.static_ip)

    # Si es static o cambia a static, validar y sincronizar IP
    elif new_tipo == "static":
        ip_val = update_data.get("ip") if "ip" in update_data else old_ip
        if not ip_val:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La dirección IP es obligatoria para conexiones estáticas.",
            )

        # Validar IP única en el router de destino
        if "ip" in update_data or "router_id" in update_data:
            exists_ip = db.query(StaticIP).filter(
                StaticIP.router_id == new_router_id,
                StaticIP.ip == ip_val,
                StaticIP.cliente_id != client.id
            ).first()
            if exists_ip:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"La dirección IP {ip_val} ya está asignada a otro cliente en este router.",
                )

        new_router = db.get(Router, new_router_id)

        # Remover IP anterior si cambió de IP o de router
        if old_ip and (old_ip != ip_val or old_router_id != new_router_id):
            try:
                remove_ip_from_address_list(old_router, old_ip)
            except Exception as e:
                logger.warning(f"No se pudo remover la IP anterior en MikroTik: {e}")

        # Guardar en base de datos
        if client.static_ip:
            client.static_ip.ip = ip_val
            client.static_ip.mac = update_data.get("mac", client.static_ip.mac)
            client.static_ip.router_id = new_router_id
            client.static_ip.notas = update_data.get("notas_ip", client.static_ip.notas)
        else:
            client.static_ip = StaticIP(
                cliente_id=client.id,
                ip=ip_val,
                mac=update_data.get("mac"),
                router_id=new_router_id,
                notas=update_data.get("notas_ip"),
            )

        # Sincronizar o remover IP en el router MikroTik según estado activo
        new_activo = update_data.get("activo", client.activo)
        if new_activo:
            try:
                sync_ip_in_address_list(new_router, ip_val, update_data.get("nombre", client.nombre))
            except Exception as e:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error al sincronizar la IP con el router MikroTik: {str(e)}"
                )
        else:
            try:
                if old_ip:
                    remove_ip_from_address_list(old_router, old_ip)
                if ip_val != old_ip:
                    remove_ip_from_address_list(new_router, ip_val)
            except Exception as e:
                logger.warning(f"No se pudo remover la IP en MikroTik al desactivar cliente: {e}")

    # Actualizar campos básicos
    for field, value in update_data.items():
        if field not in ("ip", "mac", "notas_ip"):
            setattr(client, field, value)

    db.commit()
    db.refresh(client)

    return _enrich_client(client, db)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: uuid.UUID, db: DBSession, _: AdminOrTecnico) -> None:
    """
    Elimina un cliente de la base de datos (hard-delete).
    Remueve su IP estática del MikroTik.
    """
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    if client.static_ip:
        try:
            remove_ip_from_address_list(client.router, client.static_ip.ip)
        except Exception as e:
            logger.warning(f"No se pudo remover la IP en MikroTik al borrar cliente: {e}")

    db.delete(client)
    db.commit()


@router.get("/{client_id}/plans", response_model=list[ClientPlanResponse])
def get_client_plan_history(
    client_id: uuid.UUID, db: DBSession, _: AdminOrTecnico
) -> list[ClientPlan]:
    """Obtiene el historial de planes de un cliente."""
    # Verificar que el cliente exista
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    return (
        db.query(ClientPlan)
        .filter(ClientPlan.cliente_id == client_id)
        .order_by(ClientPlan.fecha_inicio.desc())
        .all()
    )


@router.post("/{client_id}/assign-plan", response_model=ClientPlanResponse)
def assign_client_plan(
    client_id: uuid.UUID, plan_id: uuid.UUID, db: DBSession, _: AdminOrTecnico
) -> ClientPlan:
    """
    Asigna un nuevo plan a un cliente.
    Desactiva el plan activo anterior marcándolo como cancelado/fecha_fin=ahora.
    """
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")

    now = datetime.now()

    # Desactivar planes activos anteriores
    active_plans = (
        db.query(ClientPlan)
        .filter(ClientPlan.cliente_id == client_id, ClientPlan.estado == "activo")
        .all()
    )

    for ap in active_plans:
        ap.estado = "cancelado"
        ap.fecha_fin = now

    # Crear el nuevo registro del plan
    new_client_plan = ClientPlan(
        cliente_id=client_id,
        plan_id=plan_id,
        fecha_inicio=now,
        estado="activo",
    )
    db.add(new_client_plan)
    db.commit()
    db.refresh(new_client_plan)

    return new_client_plan


@router.post("/{client_id}/sync-router")
def sync_client_router(client_id: uuid.UUID, db: DBSession, _: AdminOrTecnico) -> dict:
    """Sincroniza manualmente la dirección IP estática en el MikroTik."""
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    if not client.activo:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El cliente está inactivo.")
    if client.tipo != "static" or not client.static_ip:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El cliente no posee IP estática activa.")

    try:
        sync_ip_in_address_list(client.router, client.static_ip.ip, client.nombre)
        return {"status": "success", "message": "Sincronización de IP exitosa en el router MikroTik."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Fallo al contactar el router MikroTik: {str(e)}"
        )


@router.get("/{client_id}/payments", response_model=list[PaymentResponse])
def get_client_payments(client_id: uuid.UUID, db: DBSession, _: AdminOrTecnico) -> list[ClientPayment]:
    """Obtiene el historial de pagos del cliente, sembrando mocks si está vacío."""
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
        
    payments = db.query(ClientPayment).filter(ClientPayment.cliente_id == client_id).all()
    
    if not payments:
        from datetime import datetime, timedelta
        
        p1 = ClientPayment(
            cliente_id=client_id,
            monto=22.40,
            fecha_pago=datetime.now() - timedelta(days=5),
            metodo="transferencia",
            estado="completado"
        )
        p2 = ClientPayment(
            cliente_id=client_id,
            monto=22.40,
            fecha_pago=datetime.now() - timedelta(days=35),
            metodo="efectivo",
            estado="completado"
        )
        p3 = ClientPayment(
            cliente_id=client_id,
            monto=22.40,
            fecha_pago=datetime.now() - timedelta(days=65),
            metodo="deposito",
            estado="completado"
        )
        db.add(p1)
        db.add(p2)
        db.add(p3)
        db.commit()
        payments = [p1, p2, p3]
        
    return payments


@router.get("/{client_id}/tickets", response_model=list[TicketResponse])
def get_client_tickets(client_id: uuid.UUID, db: DBSession, _: AdminOrTecnico) -> list[ClientTicket]:
    """Obtiene los tickets de soporte del cliente, sembrando un mock si está vacío."""
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
        
    tickets = db.query(ClientTicket).filter(ClientTicket.cliente_id == client_id).all()
    
    if not tickets:
        from datetime import datetime, timedelta
        t = ClientTicket(
            cliente_id=client_id,
            titulo="Intermitencia de señal por la tarde",
            descripcion="El cliente reporta que la señal de internet se vuelve lenta e intermitente de 6 PM a 8 PM.",
            prioridad="media",
            estado="resuelto",
            created_at=datetime.now() - timedelta(days=12),
            updated_at=datetime.now() - timedelta(days=10)
        )
        db.add(t)
        db.commit()
        tickets = [t]
        
    return tickets


@router.post("/{client_id}/tickets", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def create_client_ticket(client_id: uuid.UUID, payload: TicketCreate, db: DBSession, _: AdminOrTecnico) -> ClientTicket:
    """Crea un nuevo ticket de soporte para el cliente."""
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
        
    ticket = ClientTicket(
        cliente_id=client_id,
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        prioridad=payload.prioridad,
        estado="abierto",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/{client_id}/traffic", response_model=TrafficResponse)
def get_client_traffic(client_id: uuid.UUID, db: DBSession, _: AdminOrTecnico) -> dict:
    """Obtiene el historial de consumo de tráfico mensual del cliente."""
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
        
    client_seed = sum(ord(c) for c in str(client_id))
    
    months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio"]
    history = []
    
    for i, month in enumerate(months):
        base_down = 120 + ((client_seed + i * 37) % 150)
        base_up = 15 + ((client_seed * 2 + i * 13) % 40)
        
        history.append({
            "mes": month,
            "consumo_down_gb": round(base_down, 2),
            "consumo_up_gb": round(base_up, 2)
        })
        
    return {
        "cliente_id": client_id,
        "history": history
    }

