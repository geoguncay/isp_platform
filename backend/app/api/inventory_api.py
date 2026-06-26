"""
Endpoints CRUD de Inventario/Stock (InventoryItem) y Categorías (ProductCategory).
"""
import uuid
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import AdminOrTecnico, DBSession
from app.models.inventory import InventoryItem
from app.models.supplier import Supplier
from app.models.product_category import ProductCategory
from app.schemas.inventory_schema import InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse
from app.schemas.product_category_schema import ProductCategoryCreate, ProductCategoryUpdate, ProductCategoryResponse

router = APIRouter(prefix="/inventory", tags=["inventory"])


# ── Categorías ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[ProductCategoryResponse])
def list_categories(db: DBSession, _: AdminOrTecnico) -> list[ProductCategory]:
    """Lista todas las categorías de productos ordenadas por nombre."""
    return db.query(ProductCategory).order_by(ProductCategory.nombre.asc()).all()


@router.post("/categories", response_model=ProductCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: ProductCategoryCreate,
    db: DBSession,
    _: AdminOrTecnico,
) -> ProductCategory:
    """Crea una nueva categoría de producto."""
    exists = db.query(ProductCategory).filter(ProductCategory.nombre == payload.nombre).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe la categoría '{payload.nombre}'.",
        )
    cat = ProductCategory(nombre=payload.nombre)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=ProductCategoryResponse)
def update_category(
    category_id: uuid.UUID,
    payload: ProductCategoryUpdate,
    db: DBSession,
    _: AdminOrTecnico,
) -> ProductCategory:
    """Renombra una categoría y actualiza todos los artículos que la usaban."""
    cat = db.get(ProductCategory, category_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría no encontrada")
    old_nombre = cat.nombre
    cat.nombre = payload.nombre
    db.query(InventoryItem).filter(InventoryItem.categoria == old_nombre).update({"categoria": payload.nombre})
    db.commit()
    db.refresh(cat)
    return cat


# ── Artículos de Inventario ───────────────────────────────────────────────────

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


@router.post("/import")
def import_inventory_items(
    payload: list[dict],
    db: DBSession,
    _: AdminOrTecnico,
) -> dict:
    """
    Importa artículos de inventario desde datos JSON (parseados de un CSV en el frontend).
    Valida campos requeridos, duplicados de código/SKU, y resuelve proveedores por nombre.
    """
    successes = []
    failures = []
    seen_codigos: set[str] = set()

    # Pre-load suppliers for name-matching
    all_suppliers = db.query(Supplier).all()
    supplier_map = {s.nombre.strip().lower(): s for s in all_suppliers}

    for idx, row in enumerate(payload):
        try:
            nombre = (row.get("nombre") or "").strip()
            codigo = (row.get("codigo") or "").strip()
            cantidad_raw = row.get("cantidad", "0")
            minimo_alerta_raw = row.get("minimo_alerta", "5")
            precio_compra_raw = row.get("precio_compra", "0")
            precio_venta_raw = row.get("precio_venta", "0")
            descripcion = (row.get("descripcion") or "").strip() or None
            categoria = (row.get("categoria") or "").strip() or None
            modelo = (row.get("modelo") or "").strip() or None
            proveedor_raw = (row.get("proveedor") or "").strip()

            errors = []
            if not nombre:
                errors.append("El nombre del producto es requerido.")
            if not codigo:
                errors.append("El código/SKU es requerido.")

            # Parse numeric fields safely
            try:
                cantidad = int(float(cantidad_raw)) if cantidad_raw else 0
            except (ValueError, TypeError):
                errors.append(f"Cantidad inválida: '{cantidad_raw}'.")
                cantidad = 0

            try:
                minimo_alerta = int(float(minimo_alerta_raw)) if minimo_alerta_raw else 5
            except (ValueError, TypeError):
                errors.append(f"Mínimo alerta inválido: '{minimo_alerta_raw}'.")
                minimo_alerta = 5

            try:
                precio_compra = float(precio_compra_raw) if precio_compra_raw else 0.0
            except (ValueError, TypeError):
                errors.append(f"Precio compra inválido: '{precio_compra_raw}'.")
                precio_compra = 0.0

            try:
                precio_venta = float(precio_venta_raw) if precio_venta_raw else 0.0
            except (ValueError, TypeError):
                errors.append(f"Precio venta inválido: '{precio_venta_raw}'.")
                precio_venta = 0.0

            # Check duplicate codigo within file
            if codigo:
                if codigo in seen_codigos:
                    errors.append(f"El código '{codigo}' está duplicado dentro del archivo.")
                else:
                    seen_codigos.add(codigo)
                    exists = db.query(InventoryItem).filter(InventoryItem.codigo == codigo).first()
                    if exists:
                        errors.append(f"Ya existe un artículo con el código '{codigo}' en el sistema.")

            # Resolve supplier by name
            proveedor_id = None
            if proveedor_raw:
                supplier = supplier_map.get(proveedor_raw.lower())
                if supplier:
                    proveedor_id = supplier.id
                else:
                    errors.append(f"El proveedor '{proveedor_raw}' no fue encontrado en el sistema.")

            if errors:
                failures.append({
                    "fila": idx + 1,
                    "codigo": codigo,
                    "nombre": nombre,
                    "errores": errors
                })
                continue

            item = InventoryItem(
                nombre=nombre,
                codigo=codigo,
                cantidad=cantidad,
                minimo_alerta=minimo_alerta,
                precio_compra=precio_compra,
                precio_venta=precio_venta,
                descripcion=descripcion,
                categoria=categoria,
                modelo=modelo,
                proveedor_id=proveedor_id,
            )
            db.add(item)
            db.flush()
            successes.append({
                "fila": idx + 1,
                "codigo": codigo,
                "nombre": nombre
            })
        except Exception as e:
            db.rollback()
            failures.append({
                "fila": idx + 1,
                "codigo": (row.get("codigo") or ""),
                "nombre": (row.get("nombre") or ""),
                "errores": [str(e)]
            })

    if successes:
        db.commit()

    return {
        "success": len(failures) == 0,
        "total": len(payload),
        "imported_count": len(successes),
        "failed_count": len(failures),
        "successes": successes,
        "failures": failures
    }
