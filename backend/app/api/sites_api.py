"""
Endpoints CRUD de Sitios (Sites).
"""
import uuid
from fastapi import APIRouter, HTTPException, status

from app.core.deps import AdminOrTecnico, DBSession
from app.models.site import Site
from app.schemas.site import SiteCreate, SiteRead, SiteUpdate

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=list[SiteRead])
def list_sites(db: DBSession, _: AdminOrTecnico) -> list:
    return db.query(Site).order_by(Site.nombre).all()


@router.post("", response_model=SiteRead, status_code=status.HTTP_201_CREATED)
def create_site(payload: SiteCreate, db: DBSession, _: AdminOrTecnico) -> Site:
    existing = db.query(Site).filter(Site.nombre == payload.nombre.strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un sitio con ese nombre",
        )
    site = Site(
        nombre=payload.nombre.strip(),
        latitud=payload.latitud,
        longitud=payload.longitud,
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


@router.put("/{site_id}", response_model=SiteRead)
def update_site(site_id: uuid.UUID, payload: SiteUpdate, db: DBSession, _: AdminOrTecnico) -> Site:
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sitio no encontrado")
    nombre_nuevo = payload.nombre.strip()
    if nombre_nuevo != site.nombre:
        conflict = db.query(Site).filter(Site.nombre == nombre_nuevo).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe un sitio con ese nombre",
            )
    site.nombre = nombre_nuevo
    site.latitud = payload.latitud
    site.longitud = payload.longitud
    db.commit()
    db.refresh(site)
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(site_id: uuid.UUID, db: DBSession, _: AdminOrTecnico) -> None:
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sitio no encontrado")
    db.delete(site)
    db.commit()
