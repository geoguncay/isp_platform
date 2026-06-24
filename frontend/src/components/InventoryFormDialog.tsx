/**
 * InventoryFormDialog — Modal para crear y editar artículos de inventario.
 */
import React, { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, Loader2, Save, Package } from 'lucide-react'
import api from '@/services/api'

interface Supplier {
  id: string
  nombre: string
}

interface InventoryItem {
  id: string
  nombre: string
  codigo: string
  cantidad: number
  minimo_alerta: number
  precio_compra: number
  precio_venta: number
  descripcion: string | null
  categoria: string | null
  modelo: string | null
  proveedor_id: string | null
  proveedor: Supplier | null
}

interface InventoryFormDialogProps {
  isOpen: boolean
  onClose: () => void
  item?: InventoryItem | null
  onSuccess: () => void
}

export function InventoryFormDialog({ isOpen, onClose, item, onSuccess }: InventoryFormDialogProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Form State
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cantidad, setCantidad] = useState<string>('0')
  const [minimoAlerta, setMinimoAlerta] = useState<string>('5')
  const [precioCompra, setPrecioCompra] = useState<string>('0.00')
  const [precioVenta, setPrecioVenta] = useState<string>('0.00')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('')
  const [modelo, setModelo] = useState('')
  const [proveedorId, setProveedorId] = useState('')

  // Query suppliers list for dropdown mapping
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-list-dropdown'],
    queryFn: async () => {
      const { data } = await api.get('/suppliers')
      return data
    },
    enabled: isOpen
  })

  // Synchronize state when modal opens or editing item changes
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null)
      if (item) {
        setNombre(item.nombre)
        setCodigo(item.codigo)
        setCantidad(item.cantidad.toString())
        setMinimoAlerta(item.minimo_alerta.toString())
        setPrecioCompra(item.precio_compra.toString())
        setPrecioVenta(item.precio_venta.toString())
        setDescripcion(item.descripcion || '')
        setCategoria(item.categoria || '')
        setModelo(item.modelo || '')
        setProveedorId(item.proveedor_id || '')
      } else {
        setNombre('')
        setCodigo('')
        setCantidad('0')
        setMinimoAlerta('5')
        setPrecioCompra('0.00')
        setPrecioVenta('0.00')
        setDescripcion('')
        setCategoria('')
        setModelo('')
        setProveedorId('')
      }
    }
  }, [isOpen, item])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nombre: nombre.trim(),
        codigo: codigo.trim(),
        cantidad: parseInt(cantidad) || 0,
        minimo_alerta: parseInt(minimoAlerta) || 0,
        precio_compra: parseFloat(precioCompra) || 0.0,
        precio_venta: parseFloat(precioVenta) || 0.0,
        descripcion: descripcion.trim() || null,
        categoria: categoria || null,
        modelo: modelo.trim() || null,
        proveedor_id: proveedorId || null,
      }
      if (item) {
        await api.put(`/inventory/${item.id}`, payload)
      } else {
        await api.post('/inventory', payload)
      }
    },
    onSuccess: () => {
      onSuccess()
      onClose()
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail ?? 'Error al guardar el producto')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre || !codigo || cantidad === '') {
      setErrorMsg('Por favor complete todos los campos obligatorios.')
      return
    }
    saveMutation.mutate()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="glass-card w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-400" />
            <span>{item ? 'Editar Artículo' : 'Registrar Artículo'}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Nombre, Modelo y Codigo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Nombre del Producto *
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="input-field"
                placeholder="Ej. Router Mikrotik"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Modelo
              </label>
              <input
                type="text"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                className="input-field"
                placeholder="Ej. hAP ac2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Código / SKU *
              </label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="input-field font-mono"
                placeholder="MTK-HAPAC2"
              />
            </div>
          </div>

          {/* Cantidad y Minimo Alerta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Cantidad en Stock *
              </label>
              <input
                type="number"
                required
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="input-field font-mono"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Stock Mínimo para Alerta
              </label>
              <input
                type="number"
                min="0"
                value={minimoAlerta}
                onChange={(e) => setMinimoAlerta(e.target.value)}
                className="input-field font-mono"
                placeholder="5"
              />
            </div>
          </div>

          {/* Precios compra / venta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Precio Compra ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={precioCompra}
                onChange={(e) => setPrecioCompra(e.target.value)}
                className="input-field font-mono"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Precio Venta ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={precioVenta}
                onChange={(e) => setPrecioVenta(e.target.value)}
                className="input-field font-mono"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Categoría y Proveedor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Categoría del Producto
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="input-field cursor-pointer text-sm"
              >
                <option value="">-- Seleccionar Categoría --</option>
                <option value="Router">Router</option>
                <option value="Antena">Antena</option>
                <option value="ONT">ONT</option>
                <option value="ONU">ONU</option>
                <option value="Cable">Cable</option>
                <option value="Consumible">Consumible</option>
                <option value="Herramienta">Herramienta</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Proveedor Asociado
              </label>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className="input-field cursor-pointer text-sm"
              >
                <option value="">-- Seleccionar Proveedor --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Descripcion */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Descripción / Características
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="input-field h-20 resize-none py-2"
              placeholder="Ej. Router doble banda 2.4/5GHz, 5 puertos gigabit..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-secondary/40 text-foreground border border-border hover:bg-secondary/70 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20 disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Guardar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
