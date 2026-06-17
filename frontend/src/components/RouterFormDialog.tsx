/**
 * RouterFormDialog — Modal para crear y editar routers con test de conexión y mapa interactivo.
 */
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2, CheckCircle2, XCircle, Plug, Eye, EyeOff, Trash2, Download, MapPin } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/services/api'

// Icono personalizado SVG de Leaflet para evitar problemas de rutas de Vite (Color Violeta para Routers)
const markerSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238b5cf6" width="36" height="36">
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

const routerSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(120),
  ip: z.string().min(7, 'IP inválida').max(45),
  puerto_api: z.coerce.number().min(1).max(65535),
  usuario_api: z.string().min(1, 'Requerido').max(120),
  password_api: z.string().optional(),
  modelo_hw: z.string().max(120).optional(),
  notas: z.string().optional(),
  latitud: z.coerce.number().optional().nullable(),
  longitud: z.coerce.number().optional().nullable(),
}).refine(
  (data) => {
    // La contraseña es obligatoria solo si es un router nuevo (no hay id)
    if (!data.id && (!data.password_api || data.password_api.trim() === '')) {
      return false
    }
    return true
  },
  {
    message: 'Requerido',
    path: ['password_api'],
  }
)

type RouterFormData = z.infer<typeof routerSchema>

interface RouterFormDialogProps {
  open: boolean
  onClose: () => void
  router?: { 
    id: string; 
    nombre: string; 
    ip: string; 
    puerto_api: number; 
    usuario_api: string; 
    modelo_hw: string | null; 
    notas: string | null; 
    status?: 'online' | 'offline' | 'degraded' | 'unknown' | null;
    latitud?: number | null;
    longitud?: number | null;
  } | null
  onSuccess: () => void
  onDelete?: (id: string) => void
}

interface TestResult {
  success: boolean
  message: string
  ros_version?: string
  uptime?: string
  error?: string
}

export function RouterFormDialog({ open, onClose, router, onSuccess, onDelete }: RouterFormDialogProps) {
  const isEdit = !!router
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<RouterFormData>({
    resolver: zodResolver(routerSchema) as any,
    defaultValues: {
      puerto_api: 8728,
    },
  })

  // Observar latitud y longitud en tiempo real para el marcador del mapa
  const latVal = watch('latitud')
  const lngVal = watch('longitud')

  useEffect(() => {
    if (open) {
      setTestResult(null)
      setShowPassword(false)
      if (router) {
        reset({
          id: router.id,
          nombre: router.nombre,
          ip: router.ip,
          puerto_api: router.puerto_api,
          usuario_api: router.usuario_api,
          password_api: '',
          modelo_hw: router.modelo_hw ?? '',
          notas: router.notas ?? '',
          latitud: router.latitud ?? null,
          longitud: router.longitud ?? null,
        })
      } else {
        reset({ 
          id: undefined, 
          puerto_api: 8728, 
          nombre: '', 
          ip: '', 
          usuario_api: '', 
          password_api: '',
          latitud: null,
          longitud: null,
        })
      }
    }
  }, [open, router, reset])

  const saveMutation = useMutation({
    mutationFn: async (data: RouterFormData) => {
      const { id, ...payload } = data
      if (isEdit && !payload.password_api) {
        delete payload.password_api
      }
      if (payload.latitud === 0 || isNaN(Number(payload.latitud))) payload.latitud = null
      if (payload.longitud === 0 || isNaN(Number(payload.longitud))) payload.longitud = null

      if (isEdit) {
        await api.put(`/routers/${router!.id}`, payload)
      } else {
        await api.post('/routers', payload)
      }
    },
    onSuccess,
  })

  const handleTest = async () => {
    // Validamos únicamente los campos requeridos para la prueba de conexión
    const isValid = await trigger(['ip', 'puerto_api', 'usuario_api', 'password_api'])
    if (!isValid) return

    setIsTesting(true)
    setTestResult(null)

    const formValues = getValues()
    const testPayload = {
      ip: formValues.ip,
      puerto_api: formValues.puerto_api,
      usuario_api: formValues.usuario_api,
      password_api: formValues.password_api || undefined,
      router_id: router?.id || undefined,
    }

    try {
      const { data } = await api.post('/routers/test-connection', testPayload)
      setTestResult(data)
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || 'Error al contactar el servidor'
      setTestResult({ success: false, message: errMsg, error: 'Error de red/servidor' })
    } finally {
      setIsTesting(false)
    }
  }

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
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isEdit ? `Editar: ${router!.nombre}` : 'Agregar router'}
            </h2>
          </div>
          <button
            id="close-router-dialog"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form
          id="router-form"
          onSubmit={handleSubmit((data) => saveMutation.mutate(data))}
          className="p-5 space-y-4"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Columna Izquierda: Formulario */}
            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Nombre del router *
                </label>
                <input
                  id="router-nombre"
                  type="text"
                  placeholder="Router Principal Quito"
                  {...register('nombre')}
                  className="input-field"
                />
                {errors.nombre && <p className="text-xs text-destructive mt-1">{errors.nombre.message}</p>}
              </div>

              {/* IP y puerto */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    IP *
                  </label>
                  <input
                    id="router-ip"
                    type="text"
                    placeholder="192.168.88.1 o 10.147.17.x"
                    {...register('ip')}
                    className="input-field font-mono"
                  />
                  {errors.ip && (
                    <p className="text-xs text-destructive mt-1">{errors.ip.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Puerto</label>
                  <input
                    id="router-port"
                    type="number"
                    {...register('puerto_api')}
                    className="input-field font-mono"
                  />
                </div>
              </div>

              {/* Usuario y contraseña */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Usuario API *
                  </label>
                  <input
                    id="router-user"
                    type="text"
                    placeholder="admin"
                    {...register('usuario_api')}
                    className="input-field"
                  />
                  {errors.usuario_api && (
                    <p className="text-xs text-destructive mt-1">{errors.usuario_api.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Contraseña API *{isEdit && <span className="text-muted-foreground text-xs"> (dejar vacío = no cambiar)</span>}
                  </label>
                  <div className="relative">
                    <input
                      id="router-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      {...register('password_api')}
                      className="input-field pr-11"
                    />
                    <button
                      type="button"
                      id="toggle-router-password-visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password_api && (
                    <p className="text-xs text-destructive mt-1">{errors.password_api.message}</p>
                  )}
                </div>
              </div>

              {/* Modelo HW (opcional) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Modelo hardware <span className="text-muted-foreground text-xs">(opcional)</span>
                </label>
                <input
                  id="router-model"
                  type="text"
                  placeholder="RB5009, RB4011iGS+, CCR2116, etc."
                  {...register('modelo_hw')}
                  className="input-field"
                />
              </div>

              {/* Coordenadas GPS (Inputs manuales) */}
              <div className="grid grid-cols-2 gap-3 pt-2">
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

              {/* Notas (opcional) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Notas <span className="text-muted-foreground text-xs">(opcional)</span>
                </label>
                <textarea
                  id="router-notas"
                  rows={2}
                  placeholder="Ubicación, observaciones..."
                  {...register('notas')}
                  className="input-field resize-none"
                />
              </div>
            </div>

            {/* Columna Derecha: Mapa Interactivo */}
            <div className="flex flex-col h-full min-h-[350px]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-brand-400" />
                  Marcar ubicación del Router en el mapa
                </span>
                <span className="text-xs text-muted-foreground">Haz click en el mapa para fijar coordenadas</span>
              </div>

              <div className="flex-1 rounded-lg border border-border overflow-hidden min-h-[300px] lg:h-full relative">
                <MapContainer
                  center={mapCenter}
                  zoom={12}
                  scrollWheelZoom={true}
                  style={{ height: '100%', width: '100%', minHeight: '300px', zIndex: 10 }}
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

          {/* Test de conexión */}
          <div className="border border-border rounded-lg p-4 space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Probar conexión</p>
              <button
                type="button"
                id="test-connection-btn"
                onClick={handleTest}
                disabled={isTesting}
                className="btn-secondary text-xs py-1.5"
              >
                {isTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plug className="w-3.5 h-3.5" />
                )}
                {isTesting ? 'Probando...' : 'Probar ahora'}
              </button>
            </div>

            {testResult && (
              <div
                className={`rounded-lg p-3 flex items-start gap-3 ${testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'bg-destructive/10 border border-destructive/30'
                  }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                )}
                <div className="text-xs space-y-1">
                  <p className={testResult.success ? 'text-emerald-400' : 'text-destructive'}>
                    {testResult.message}
                  </p>
                  {testResult.ros_version && (
                    <p className="text-muted-foreground">
                      RouterOS {testResult.ros_version} · Uptime: {testResult.uptime}
                    </p>
                  )}
                  {testResult.error && (
                    <p className="text-muted-foreground font-mono">{testResult.error}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Error de guardado */}
          {saveMutation.isError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
              <p className="text-sm text-destructive">
                Error al guardar. Verifica los datos e intenta de nuevo.
              </p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-wrap gap-3 pt-2">
            {isEdit && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onDelete?.(router!.id)
                  }}
                  className="btn-destructive px-3.5 justify-center flex items-center gap-1.5"
                  title="Eliminar router"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar</span>
                </button>
              </>
            )}
            <div className="flex-grow" />
            <button
              type="button"
              id="cancel-router-form"
              onClick={onClose}
              className="btn-secondary w-24 justify-center"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-router-btn"
              disabled={saveMutation.isPending}
              className="btn-primary w-36 justify-center"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {saveMutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Agregar router'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
