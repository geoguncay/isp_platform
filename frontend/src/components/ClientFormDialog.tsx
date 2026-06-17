/**
 * ClientFormDialog — Modal para crear y editar clientes con mapa interactivo Leaflet.
 */
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2, MapPin, Calendar } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/services/api'
import { validateEcuadorianDocument } from '@/lib/validators'

// Icono personalizado SVG de Leaflet para evitar problemas de rutas de Vite
const markerSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232563eb" width="36" height="36">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
  </svg>
`)}`

const customMarkerIcon = L.icon({
  iconUrl: markerSvg,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -30],
})

// Centrado por defecto en Quito, Ecuador
const DEFAULT_CENTER: [number, number] = [-0.180653, -78.467834]

const clientSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(120),
  tipo_documento: z.enum(['cedula', 'ruc']),
  cedula: z.string(),
  telefono: z.string().min(5, 'Mínimo 5 caracteres').max(40),
  direccion: z.string().min(5, 'Mínimo 5 caracteres').max(255),
  latitud: z.coerce.number().optional().nullable(),
  longitud: z.coerce.number().optional().nullable(),
  router_id: z.string().min(1, 'Debe seleccionar un router'),
  tipo: z.enum(['static', 'pppoe']),
  plan_id: z.string().optional().nullable(),
  activo: z.boolean().optional(),
  ip: z.string().optional().nullable(),
  mac: z.string().optional().nullable(),
  notas_ip: z.string().optional().nullable(),
  email: z.string().email('Ingrese un correo válido').optional().or(z.literal('')),
  created_at: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // 1. Validar identificación (cédula o ruc)
  const tipo = data.tipo_documento
  const doc = data.cedula

  if (!doc) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La identificación es obligatoria',
      path: ['cedula'],
    })
  } else if (!/^\d+$/.test(doc)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Solo números',
      path: ['cedula'],
    })
  } else if (tipo === 'cedula') {
    if (doc.length !== 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La cédula ecuatoriana debe tener exactamente 10 dígitos',
        path: ['cedula'],
      })
    } else if (!validateEcuadorianDocument(doc, 'cedula')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La cédula ingresada no es válida',
        path: ['cedula'],
      })
    }
  } else if (tipo === 'ruc') {
    if (doc.length !== 13) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El RUC debe tener exactamente 13 dígitos',
        path: ['cedula'],
      })
    } else if (!validateEcuadorianDocument(doc, 'ruc')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El RUC ingresado no es válido',
        path: ['cedula'],
      })
    }
  }

  // 2. Validar IP obligatoria para tipo estática
  if (data.tipo === 'static' && (!data.ip || data.ip.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La dirección IP es obligatoria',
      path: ['ip'],
    })
  }
})

type ClientFormData = z.infer<typeof clientSchema>

interface ClientFormDialogProps {
  open: boolean
  onClose: () => void
  client?: any | null
  onSuccess: () => void
}

export function ClientFormDialog({ open, onClose, client, onSuccess }: ClientFormDialogProps) {
  const isEdit = !!client
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema) as any,
  })

  // Ver valores de lat/lng en tiempo real
  const latVal = watch('latitud')
  const lngVal = watch('longitud')
  const watchDocType = watch('tipo_documento')

  // Obtener Routers
  const { data: routers = [] } = useQuery({
    queryKey: ['routers-form'],
    queryFn: async () => {
      const { data } = await api.get('/routers')
      return data
    },
    enabled: open,
  })

  // Obtener Planes
  const { data: plans = [] } = useQuery({
    queryKey: ['plans-form'],
    queryFn: async () => {
      const { data } = await api.get('/plans')
      return data
    },
    enabled: open,
  })

  useEffect(() => {
    if (open) {
      setErrorMessage(null)
      if (client) {
        reset({
          id: client.id,
          nombre: client.nombre,
          tipo_documento: client.cedula?.length === 13 ? 'ruc' : 'cedula',
          cedula: client.cedula,
          telefono: client.telefono,
          direccion: client.direccion,
          latitud: client.latitud,
          longitud: client.longitud,
          router_id: client.router_id,
          tipo: client.tipo,
          plan_id: client.plan_activo?.id ?? '',
          activo: client.activo,
          ip: client.static_ip?.ip ?? '',
          mac: client.static_ip?.mac ?? '',
          notas_ip: client.static_ip?.notas ?? '',
          email: client.email ?? '',
          created_at: client.created_at ? client.created_at.split('T')[0] : '',
        })
      } else {
        const today = new Date()
        const yyyy = today.getFullYear()
        const mm = String(today.getMonth() + 1).padStart(2, '0')
        const dd = String(today.getDate()).padStart(2, '0')
        const todayStr = `${yyyy}-${mm}-${dd}`
        reset({
          id: undefined,
          nombre: '',
          tipo_documento: 'cedula',
          cedula: '',
          telefono: '',
          direccion: '',
          latitud: null,
          longitud: null,
          router_id: '',
          tipo: 'static',
          plan_id: '',
          activo: true,
          ip: '',
          mac: '',
          notas_ip: '',
          email: '',
          created_at: todayStr,
        })
      }
    }
  }, [open, client, reset])

  const saveMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const payload: any = { ...data }
      delete payload.tipo_documento
      if (!payload.plan_id) delete payload.plan_id
      if (payload.latitud === 0 || isNaN(Number(payload.latitud))) payload.latitud = null
      if (payload.longitud === 0 || isNaN(Number(payload.longitud))) payload.longitud = null

      if (!payload.email || payload.email.trim() === '') {
        payload.email = null
      }

      if (!payload.created_at || payload.created_at.trim() === '') {
        delete payload.created_at
      } else {
        payload.created_at = `${payload.created_at}T12:00:00`
      }

      if (payload.tipo === 'pppoe') {
        payload.ip = null
        payload.mac = null
        payload.notas_ip = null
      } else {
        if (!payload.mac || payload.mac.trim() === '') payload.mac = null
        if (!payload.notas_ip || payload.notas_ip.trim() === '') payload.notas_ip = null
      }

      if (isEdit) {
        delete payload.plan_id // No modificamos plan_id vía update cliente directamente (se hace desde perfil)
        await api.put(`/clients/${client.id}`, payload)
      } else {
        await api.post('/clients', payload)
      }
    },
    onSuccess,
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Error al guardar el cliente'
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  // Componente interno para manejar los clicks en el mapa
  function MapEventsHandler() {
    useMapEvents({
      click(e) {
        setValue('latitud', Number(e.latlng.lat.toFixed(6)))
        setValue('longitud', Number(e.latlng.lng.toFixed(6)))
      },
    })
    return null
  }

  if (!open) return null

  // Coordenadas iniciales para render del Marker
  const mapCenter: [number, number] = latVal && lngVal ? [latVal, lngVal] : DEFAULT_CENTER

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-6xl mx-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? `Editar: ${client.nombre}` : 'Registrar Nuevo Cliente'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="p-5 space-y-5">
          {errorMessage && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs text-destructive">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Campos a la izquierda */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider">
                <MapPin className="w-4 h-4" /> Datos personales y técnicos
              </div>

              {/* Nombre completo */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Nombre Completo *</label>
                <input
                  type="text"
                  placeholder="Juan Andres Perez"
                  {...register('nombre')}
                  className="input-field"
                />
                {errors.nombre && <p className="text-xs text-destructive mt-1">{errors.nombre.message}</p>}
              </div>

              {/* Tipo Identificación, Identificación y Teléfono */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Tipo Doc. *</label>
                  <select
                    {...register('tipo_documento')}
                    className="input-field cursor-pointer"
                  >
                    <option value="cedula">Cédula</option>
                    <option value="ruc">RUC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {watchDocType === 'ruc' ? 'RUC *' : 'Cédula *'}
                  </label>
                  <input
                    type="text"
                    placeholder={watchDocType === 'ruc' ? '1724024888001' : '1724024888'}
                    {...register('cedula')}
                    className="input-field font-mono"
                  />
                  {errors.cedula && <p className="text-xs text-destructive mt-1">{errors.cedula.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Teléfono *</label>
                  <input
                    type="text"
                    placeholder="0999999999"
                    {...register('telefono')}
                    className="input-field font-mono"
                  />
                  {errors.telefono && <p className="text-xs text-destructive mt-1">{errors.telefono.message}</p>}
                </div>
              </div>

              {/* Correo Electrónico y Fecha de Registro */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Correo Electrónico <span className="text-muted-foreground text-xs">(opcional)</span></label>
                  <input
                    type="email"
                    placeholder="ejemplo@correo.com"
                    {...register('email')}
                    className="input-field"
                  />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Fecha de Registro *</label>
                  <input
                    type="date"
                    {...register('created_at')}
                    className="input-field font-sans cursor-pointer"
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker()
                      } catch (err) {}
                    }}
                    onFocus={(e) => {
                      try {
                        e.currentTarget.showPicker()
                      } catch (err) {}
                    }}
                  />
                  {errors.created_at && <p className="text-xs text-destructive mt-1">{errors.created_at.message}</p>}
                </div>
              </div>

              {/* Dirección */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Dirección de Domicilio *</label>
                <input
                  type="text"
                  placeholder="Calle 12 y Av. Amazonas"
                  {...register('direccion')}
                  className="input-field"
                />
                {errors.direccion && <p className="text-xs text-destructive mt-1">{errors.direccion.message}</p>}
              </div>

              {/* Router asignado y Tipo de Conexión */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Router asignado *</label>
                  <select {...register('router_id')} className="input-field cursor-pointer">
                    <option value="">Seleccione router</option>
                    {routers.map((r: any) => (
                      <option key={r.id} value={r.id}>{r.nombre} ({r.ip})</option>
                    ))}
                  </select>
                  {errors.router_id && <p className="text-xs text-destructive mt-1">{errors.router_id.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Tipo de Conexión *</label>
                  <select {...register('tipo')} className="input-field cursor-pointer">
                    <option value="static">IP Estática</option>
                    <option value="pppoe">PPPoE</option>
                  </select>
                  {errors.tipo && <p className="text-xs text-destructive mt-1">{errors.tipo.message}</p>}
                </div>
              </div>

              {/* Campos condicionales para IP Estática */}
              {watch('tipo') === 'static' && (
                <div className="space-y-4 border-l-2 border-brand-500 pl-3.5 py-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Dirección IP *</label>
                      <input
                        type="text"
                        placeholder="192.168.10.50"
                        {...register('ip')}
                        className="input-field font-mono"
                      />
                      {errors.ip && <p className="text-xs text-destructive mt-1">{errors.ip.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Dirección MAC</label>
                      <input
                        type="text"
                        placeholder="AA:BB:CC:DD:EE:FF"
                        {...register('mac')}
                        className="input-field font-mono"
                      />
                      {errors.mac && <p className="text-xs text-destructive mt-1">{errors.mac.message}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Notas de Red</label>
                    <input
                      type="text"
                      placeholder="Ej: Antena LiteBeam, Ubiquiti, etc."
                      {...register('notas_ip')}
                      className="input-field"
                    />
                  </div>
                </div>
              )}

              {/* Plan Inicial (Solo visible en creación) */}
              {!isEdit && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Plan de Internet inicial <span className="text-muted-foreground text-xs">(opcional)</span></label>
                  <select {...register('plan_id')} className="input-field cursor-pointer">
                    <option value="">Sin plan inicial</option>
                    {plans.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.nombre} (${Number(p.precio).toFixed(2)})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Coordenadas GPS (Inputs manuales) */}
              <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Latitud</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="-0.180653"
                    {...register('latitud')}
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Longitud</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="-78.467834"
                    {...register('longitud')}
                    className="input-field font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Mapa interactivo a la derecha */}
            <div className="flex flex-col h-full min-h-[300px] lg:min-h-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-brand-400" />
                  Marcar ubicación en el mapa
                </span>
                <span className="text-xs text-muted-foreground">Haz click para fijar coordenadas</span>
              </div>

              <div className="flex-1 rounded-lg border border-border overflow-hidden h-72 lg:h-[350px]">
                <MapContainer
                  center={mapCenter}
                  zoom={12}
                  scrollWheelZoom={true}
                  style={{ height: '100%', width: '100%', zIndex: 10 }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapEventsHandler />
                  {latVal && lngVal && (
                    <Marker position={[latVal, lngVal]} icon={customMarkerIcon} />
                  )}
                </MapContainer>
              </div>
            </div>
          </div>

          {/* Acciones del Modal */}
          <div className="flex justify-end gap-3 border-t border-border/50 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary w-32 justify-center"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="btn-primary w-44 justify-center"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {saveMutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Registrar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
