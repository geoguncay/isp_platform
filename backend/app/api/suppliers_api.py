"""
Endpoints CRUD de Proveedores (Suppliers).
"""
import uuid
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import AdminOrTecnico, DBSession
from app.models.supplier import Supplier
from app.schemas.supplier_schema import SupplierCreate, SupplierUpdate, SupplierResponse

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=list[SupplierResponse])
def list_suppliers(
    db: DBSession,
    _: AdminOrTecnico,
    search: str | None = None,
) -> list[Supplier]:
    """Lista todos los proveedores con buscador opcional."""
    query = db.query(Supplier)
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (Supplier.nombre.ilike(search_filter))
            | (Supplier.ruc.ilike(search_filter))
            | (Supplier.telefono.ilike(search_filter))
        )
    return query.order_by(Supplier.nombre.asc()).all()


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(
    supplier_id: uuid.UUID,
    db: DBSession,
    _: AdminOrTecnico,
) -> Supplier:
    """Obtiene el detalle de un proveedor."""
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    return supplier


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    db: DBSession,
    _: AdminOrTecnico,
) -> Supplier:
    """Crea un nuevo proveedor."""
    exists = db.query(Supplier).filter(Supplier.ruc == payload.ruc).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un proveedor registrado con el RUC {payload.ruc}.",
        )
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: uuid.UUID,
    payload: SupplierUpdate,
    db: DBSession,
    _: AdminOrTecnico,
) -> Supplier:
    """Edita un proveedor."""
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
        
    update_data = payload.model_dump(exclude_unset=True)
    
    if "ruc" in update_data and update_data["ruc"] != supplier.ruc:
        exists = db.query(Supplier).filter(Supplier.ruc == update_data["ruc"]).first()
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un proveedor registrado con el RUC {update_data['ruc']}.",
            )
            
    for field, value in update_data.items():
        setattr(supplier, field, value)
        
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(
    supplier_id: uuid.UUID,
    db: DBSession,
    _: AdminOrTecnico,
) -> None:
    """Elimina un proveedor de la base de datos."""
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    db.delete(supplier)
    db.commit()
