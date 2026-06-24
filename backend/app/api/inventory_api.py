"""
Endpoints CRUD de Inventario/Stock (InventoryItem).
"""
import uuid
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import AdminOrTecnico, DBSession
from app.models.inventory import InventoryItem
from app.models.supplier import Supplier
from app.schemas.inventory_schema import InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("", response_model=list[InventoryItemResponse])
def list_inventory_items(
    db: DBSession,
    _: AdminOrTecnico,
    search: str | None = None,
) -> list[InventoryItem]:
    """Lista todos los artículos en inventario con buscador opcional."""
    query = db.query(InventoryItem)
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (InventoryItem.nombre.ilike(search_filter))
            | (InventoryItem.codigo.ilike(search_filter))
        )
    return query.order_by(InventoryItem.nombre.asc()).all()


@router.get("/{item_id}", response_model=InventoryItemResponse)
def get_inventory_item(
    item_id: uuid.UUID,
    db: DBSession,
    _: AdminOrTecnico,
) -> InventoryItem:
    """Obtiene el detalle de un artículo de inventario."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado")
    return item


@router.post("", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_item(
    payload: InventoryItemCreate,
    db: DBSession,
    _: AdminOrTecnico,
) -> InventoryItem:
    """Crea un nuevo artículo de inventario."""
    exists = db.query(InventoryItem).filter(InventoryItem.codigo == payload.codigo).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un artículo en inventario con el código o SKU {payload.codigo}.",
        )
        
    if payload.proveedor_id:
        supplier = db.get(Supplier, payload.proveedor_id)
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El proveedor especificado no existe.",
            )
            
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=InventoryItemResponse)
def update_inventory_item(
    item_id: uuid.UUID,
    payload: InventoryItemUpdate,
    db: DBSession,
    _: AdminOrTecnico,
) -> InventoryItem:
    """Edita un artículo de inventario."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado")
        
    update_data = payload.model_dump(exclude_unset=True)
    
    if "codigo" in update_data and update_data["codigo"] != item.codigo:
        exists = db.query(InventoryItem).filter(InventoryItem.codigo == update_data["codigo"]).first()
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un artículo con el código o SKU {update_data['codigo']}.",
            )
            
    if "proveedor_id" in update_data and update_data["proveedor_id"]:
        supplier = db.get(Supplier, update_data["proveedor_id"])
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El proveedor especificado no existe.",
            )
            
    for field, value in update_data.items():
        setattr(item, field, value)
        
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_item(
    item_id: uuid.UUID,
    db: DBSession,
    _: AdminOrTecnico,
) -> None:
    """Elimina un artículo de inventario."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado")
    db.delete(item)
    db.commit()
