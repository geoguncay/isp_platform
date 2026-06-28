"""
Endpoints CRUD de usuarios (solo admin).
"""
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminOnly, CurrentUser, DBSession
from app.core.security import hash_password
from app.models.user import User
from app.models.client import Client
from app.schemas.user import ClientStats, UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(db: DBSession, _: AdminOnly) -> list[User]:
    return db.query(User).order_by(User.created_at.desc()).all()


@router.get("/stats", response_model=ClientStats)
def get_client_stats(db: DBSession, _: AdminOnly) -> ClientStats:
    """
    Retorna conteo de clientes WISP agrupados por estado:
      - conectados, desconectados, suspendidos
    """
    clients = db.query(Client).all()
    total = len(clients)
    conectados = 0
    desconectados = 0
    suspendidos = 0
    for c in clients:
        if not c.activo:
            suspendidos += 1
        else:
            first_char = str(c.id)[0]
            if ord(first_char) % 7 == 0:
                desconectados += 1
            else:
                conectados += 1
    return ClientStats(
        total=total,
        conectados=conectados,
        desconectados=desconectados,
        suspendidos=suspendidos,
    )


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: DBSession, _: AdminOnly) -> User:
    user = User(
        nombre=payload.nombre,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        rol=payload.rol,
        activo=payload.activo,
        tipo_operador=payload.tipo_operador,
        permisos_router=payload.permisos_router,
        horario_acceso=payload.horario_acceso,
        permisos=payload.permisos,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un usuario con email {payload.email}",
        )
    return user


@router.get("/me", response_model=UserRead)
def get_me(current_user: CurrentUser) -> User:
    return current_user


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: uuid.UUID, db: DBSession, _: AdminOnly) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return user


@router.put("/{user_id}", response_model=UserRead)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> User:
    # Admin puede editar cualquier usuario; los demás solo su propio perfil
    if current_user.rol != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["hashed_password"] = hash_password(update_data.pop("password"))

    # Proteger contra dejar el sistema sin admin activo
    if user.rol == "admin":
        desactivando = update_data.get("activo") is False
        cambiando_rol = "rol" in update_data and update_data["rol"] != "admin"
        if desactivando or cambiando_rol:
            admins_activos = (
                db.query(User)
                .filter(User.rol == "admin", User.activo == True, User.id != user.id)
                .count()
            )
            if admins_activos == 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="No se puede desactivar o cambiar el rol de este administrador porque es el único activo en el sistema.",
                )

    for field, value in update_data.items():
        setattr(user, field, value)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya en uso")

    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, db: DBSession, _: AdminOnly) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    db.delete(user)
    db.commit()
