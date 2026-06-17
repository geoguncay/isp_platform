"""
Endpoints CRUD de Planes de ancho de banda (velocidades y precios).
"""
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminOnly, CurrentUser, DBSession
from app.models.plan import Plan
from app.models.client_plan import ClientPlan
from app.schemas.plan import PlanCreate, PlanResponse, PlanUpdate

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("", response_model=list[PlanResponse])
def list_plans(db: DBSession, _: CurrentUser) -> list[Plan]:
    """Lista todos los planes de ancho de banda."""
    return db.query(Plan).order_by(Plan.precio.asc()).all()


@router.post("", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
def create_plan(payload: PlanCreate, db: DBSession, _: AdminOnly) -> Plan:
    """Crea un nuevo plan (Solo Administradores)."""
    p = Plan(
        nombre=payload.nombre,
        velocidad_down_mbps=payload.velocidad_down_mbps,
        velocidad_up_mbps=payload.velocidad_up_mbps,
        precio=payload.precio,
    )
    db.add(p)
    try:
        db.commit()
        db.refresh(p)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un plan con el nombre: {payload.nombre}",
        )
    return p


@router.get("/{plan_id}", response_model=PlanResponse)
def get_plan(plan_id: uuid.UUID, db: DBSession, _: CurrentUser) -> Plan:
    """Obtiene el detalle de un plan."""
    p = db.get(Plan, plan_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")
    return p


@router.put("/{plan_id}", response_model=PlanResponse)
def update_plan(
    plan_id: uuid.UUID, payload: PlanUpdate, db: DBSession, _: AdminOnly
) -> Plan:
    """Edita un plan existente (Solo Administradores)."""
    p = db.get(Plan, plan_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(p, field, value)

    try:
        db.commit()
        db.refresh(p)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un plan con el nombre: {payload.nombre}",
        )
    return p


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: uuid.UUID, db: DBSession, _: AdminOnly) -> None:
    """Elimina un plan si no está en uso por ningún cliente activo (Solo Administradores)."""
    p = db.get(Plan, plan_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")

    # Validar si el plan está en uso por algún cliente con estado 'activo' o 'suspendido'
    in_use = db.query(ClientPlan).filter(
        ClientPlan.plan_id == plan_id,
        ClientPlan.estado.in_(["activo", "suspendido"])
    ).first()

    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar el plan porque está asignado a clientes activos o suspendidos.",
        )

    db.delete(p)
    db.commit()
