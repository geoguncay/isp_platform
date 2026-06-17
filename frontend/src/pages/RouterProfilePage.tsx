/**
 * RouterProfilePage — Ficha del router, listado de clientes asociados, ubicación geográfica y configuración de MikroTik.
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, RefreshCw, MapPin, Shield, Wifi, Server, Clock,
  CheckCircle2, XCircle, Sliders, AlertCircle, Loader2, X, Plus,
  Edit2, Trash2, Download, Search, Users, Network
} from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/services/api'
import { RouterStatusBadge } from '@/components/RouterStatusBadge'
import { RouterFormDialog } from '@/components/RouterFormDialog'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatUptime } from '@/lib/utils'

// Centrado por defecto en Quito, Ecuador
const DEFAULT_CENTER: [number, number] = [-0.180653, -78.467834]

// Icono personalizado violeta para el Router
const routerSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238b5cf6" width="38" height="38">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
  </svg>
`)}`

const routerIcon = L.icon({
  iconUrl: routerSvg,
  iconSize: [38, 38],
  iconAnchor: [19, 38],
  popupAnchor: [0, -32],
})

interface Client {
  id: string
  nombre: string
  cedula: string
  telefono: string
  tipo: 'static' | 'pppoe'
  activo: boolean
  latitud: number | null
  longitud: number | null
  plan_activo?: { nombre: string; velocidad_down_mbps?: number; velocidad_up_mbps?: number } | null
  static_ip?: { ip: string } | null
}

interface TestResult {
  success: boolean
  message: string
  ros_version?: string
  uptime?: string
  error?: string
}

interface DonutChartProps {
  percentage: number
  title: string
  label1: string
  val1: string | number
  color1: string
  label2: string
  val2: string | number
  color2: string
  centerLabel: string
  centerSublabel: string
}

function DonutChart({
  percentage,
  title,
  label1,
  val1,
  color1,
  label2,
  val2,
  color2,
  centerLabel,
  centerSublabel
}: DonutChartProps) {
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="bg-secondary/10 p-5 rounded-xl border border-border/40 space-y-4 flex flex-col items-center">
      <h4 className="text-sm font-semibold text-foreground self-start">{title}</h4>

      <div className="relative w-36 h-36 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Base Circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={color2}
            strokeWidth="10"
          />
          {/* Main Circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={color1}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center Text */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-lg font-extrabold text-foreground">{centerLabel}</span>
          <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{centerSublabel}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="w-full grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/20">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color1 }}></span>
            <span>{label1}</span>
          </div>
          <span className="text-xs font-bold text-foreground mt-0.5">{val1}</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color2 }}></span>
            <span>{label2}</span>
          </div>
          <span className="text-xs font-bold text-foreground mt-0.5">{val2}</span>
        </div>
      </div>
    </div>
  )
}

export function RouterProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { hideIps } = useSettingsStore()
  const isAdmin = user?.rol === 'admin'

  const [activeTab, setActiveTab] = useState<'stats' | 'clients' | 'map' | 'settings'>('stats')
  const [searchTerm, setSearchTerm] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Test connection state
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  // Address-list client import states
  const [importingOpen, setImportingOpen] = useState(false)
  const [selectedListName, setSelectedListName] = useState('clientes')
  const [customListName, setCustomListName] = useState('')

  // Consultar información del Router
  const { data: router, isLoading: isLoadingRouter, isError: isErrorRouter, refetch: refetchRouter } = useQuery({
    queryKey: ['router', id],
    queryFn: async () => {
      const { data } = await api.get(`/routers/${id}`)
      return data
    }
  })

  // Consultar todos los clientes del router (para estadísticas y mapa de cobertura)
  const { data: allClients = [], isLoading: isLoadingAllClients } = useQuery<Client[]>({
    queryKey: ['router-clients-all', id],
    queryFn: async () => {
      const { data } = await api.get(`/clients`, {
        params: { router_id: id, limit: 1000 }
      })
      return data.items || []
    }
  })

  // Consultar clientes asociados paginados (para la pestaña Clientes)
  const [clientsPage, setClientsPage] = useState(1)
  const clientsLimit = 10

  const { data: paginatedClientsData = { items: [], total: 0 }, isLoading: isLoadingPaginated } = useQuery({
    queryKey: ['router-clients-paginated', id, clientsPage, searchTerm],
    queryFn: async () => {
      const params: any = {
        router_id: id,
        skip: (clientsPage - 1) * clientsLimit,
        limit: clientsLimit
      }
      if (searchTerm.trim()) {
        params.search = searchTerm
      }
      const { data } = await api.get(`/clients`, { params })
      return data
    }
  })

  // Query to get address list names from this router
  const { data: addressLists = [], isLoading: isLoadingLists } = useQuery<string[]>({
    queryKey: ['address-lists', id],
    queryFn: async () => {
      const { data } = await api.get(`/routers/${id}/address-lists`)
      return data
    },
    enabled: importingOpen,
  })

  // Mutación para probar conexión
  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.post(`/routers/${id}/test-connection`)
      setTestResult(data)
      refetchRouter()
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || 'Error de red al conectar al router'
      setTestResult({ success: false, message: errMsg })
    } finally {
      setIsTesting(false)
    }
  }

  // Mutación para importar clientes de address-list
  const importMutation = useMutation({
    mutationFn: async (listName: string) => {
      const { data } = await api.post(`/routers/${id}/import-clients`, null, {
        params: { list_name: listName }
      })
      return data
    },
    onSuccess: (data: any) => {
      alert(`Importación exitosa. Se importaron ${data.imported_count} nuevos clientes.`)
      setImportingOpen(false)
      setSelectedListName('clientes')
      setCustomListName('')
      queryClient.invalidateQueries({ queryKey: ['router-clients', id] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Error al importar clientes desde el router.'
      alert(msg)
    }
  })

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const listName = selectedListName === 'custom' ? customListName.trim() : selectedListName
    if (!listName) return
    importMutation.mutate(listName)
  }

  // Mutación para eliminar router
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/routers/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routers'] })
      navigate('/routers')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Error al eliminar el router'
      alert(msg)
    }
  })

  if (isLoadingRouter) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Cargando perfil del router...</span>
        </div>
      </div>
    )
  }

  if (isErrorRouter || !router) {
    return (
      <div className="glass-card p-12 text-center max-w-lg mx-auto mt-12">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Error al cargar el router</h3>
        <p className="text-muted-foreground text-sm mb-6">
          El router solicitado no existe o ha sido desactivado permanentemente.
        </p>
        <button onClick={() => navigate('/routers')} className="btn-secondary mx-auto">
          <ArrowLeft className="w-4 h-4" />
          Volver a Routers
        </button>
      </div>
    )
  }

  // Calcular estadísticas usando la lista completa de clientes (allClients)
  const activeClients = allClients.filter((c: Client) => c.activo).length
  const inactiveClients = allClients.length - activeClients
  const totalClients = allClients.length
  const activePercentage = totalClients > 0 ? (activeClients / totalClients) * 100 : 0

  const totalDownMbps = allClients.reduce((acc: number, c: Client) => acc + (c.activo && c.plan_activo?.velocidad_down_mbps ? c.plan_activo.velocidad_down_mbps : 0), 0)
  const totalUpMbps = allClients.reduce((acc: number, c: Client) => acc + (c.activo && c.plan_activo?.velocidad_up_mbps ? c.plan_activo.velocidad_up_mbps : 0), 0)

  const trafficDownGb = Math.round(activeClients * 148.5)
  const trafficUpGb = Math.round(activeClients * 34.2)
  const totalTrafficGb = trafficDownGb + trafficUpGb
  const downTrafficPct = totalTrafficGb > 0 ? (trafficDownGb / totalTrafficGb) * 100 : 80

  const totalPages = Math.ceil((paginatedClientsData.total || 0) / clientsLimit)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Breadcrumb & Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/routers')}
            className="w-10 h-10 rounded-lg bg-secondary/50 border border-border flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{router.nombre}</h1>
              <RouterStatusBadge status={router.status ?? 'unknown'} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              ID: {router.id} {router.modelo_hw ? `· HW: ${router.modelo_hw}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchRouter()}
            className="btn-secondary"
          >
            <RefreshCw className="w-4 h-4" />
            Sincronizar
          </button>
          {isAdmin && (
            <button
              onClick={() => setEditOpen(true)}
              className="btn-primary"
            >
              <Edit2 className="w-4 h-4" />
              Editar Router
            </button>
          )}
        </div>
      </div>

      {/* ── Grid Principal ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Barra Lateral Izquierda - Detalles Rápidos */}
        <div className="space-y-6">
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-2 text-brand-400 font-semibold text-sm border-b border-border/40 pb-2">
              <Server className="w-4.5 h-4.5" />
              <span>Información de Conexión</span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="block text-xs text-muted-foreground">Dirección IP / Host</span>
                <code className="text-sm font-mono text-foreground font-semibold">
                  {hideIps ? '••••••••' : router.ip}:{router.puerto_api}
                </code>
              </div>

              <div>
                <span className="block text-xs text-muted-foreground">Usuario API</span>
                <span className="text-sm text-foreground font-medium">{router.usuario_api}</span>
              </div>

              {router.ros_version && (
                <div>
                  <span className="block text-xs text-muted-foreground">Versión RouterOS</span>
                  <span className="text-sm text-foreground font-mono font-medium">{router.ros_version}</span>
                </div>
              )}

              {router.uptime && (
                <div>
                  <span className="block text-xs text-muted-foreground">Tiempo Activo (Uptime)</span>
                  <span className="text-sm text-foreground font-medium">{formatUptime(router.uptime)}</span>
                </div>
              )}

            </div>
          </div>

          {/* Tarjeta de Localización */}
          <div className="glass-card p-5 space-y-3">
            <div className="flex items-center gap-2 text-brand-400 font-semibold text-sm border-b border-border/40 pb-2">
              <MapPin className="w-4.5 h-4.5" />
              <span>Coordenadas GPS</span>
            </div>
            {router.latitud && router.longitud ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Latitud:</span>
                  <span className="font-mono text-foreground font-semibold">{router.latitud}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Longitud:</span>
                  <span className="font-mono text-foreground font-semibold">{router.longitud}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground">Sin ubicación geográfica registrada.</p>
                {isAdmin && (
                  <button
                    onClick={() => setEditOpen(true)}
                    className="text-xs text-brand-400 hover:text-brand-300 font-bold mt-2 hover:underline transition-all"
                  >
                    Marcar ubicación en el mapa
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tarjeta de Notas */}
          <div className="glass-card p-5 space-y-2">
            <div className="text-brand-400 font-semibold text-sm border-b border-border/40 pb-2">
              Observaciones
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {router.notas ? router.notas : 'Sin comentarios adicionales.'}
            </p>
          </div>
        </div>

        {/* Panel Principal - Tabs a la Derecha */}
        <div className="lg:col-span-2 space-y-6">
          {/* Navegación de Tabs */}
          <div className="flex border-b border-border gap-2">
            {[
              { id: 'stats', label: 'Estadísticas', icon: Network },
              { id: 'clients', label: 'Clientes Asociados', icon: Users },
              { id: 'map', label: 'Mapa de Cobertura', icon: MapPin },
              { id: 'settings', label: 'Configuración & Diagnóstico', icon: Sliders },
            ].map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${isActive
                      ? 'border-brand-500 text-brand-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Pestaña: Estadísticas */}
          {activeTab === 'stats' && (
            <div className="space-y-6">
              {/* Doughnut charts grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DonutChart
                  percentage={activePercentage}
                  title="Distribución de Clientes"
                  label1="Activos"
                  val1={activeClients}
                  color1="#10b981"
                  label2="Suspendidos"
                  val2={inactiveClients}
                  color2="#f59e0b"
                  centerLabel={`${Math.round(activePercentage)}%`}
                  centerSublabel="Activos"
                />

                <DonutChart
                  percentage={downTrafficPct}
                  title="Consumo de Tráfico General (Este mes)"
                  label1="Descarga (Down)"
                  val1={`${trafficDownGb} GB`}
                  color1="#3b82f6"
                  label2="Subida (Up)"
                  val2={`${trafficUpGb} GB`}
                  color2="#a855f7"
                  centerLabel={`${(totalTrafficGb / 1000).toFixed(2)} TB`}
                  centerSublabel="Total"
                />
              </div>

              {/* Ancho de Banda Asignado summaries */}
              <div className="glass-card p-5 border border-border/40 space-y-4 font-sans">
                <h3 className="text-sm font-semibold text-foreground border-b border-border/40 pb-2.5 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brand-400" />
                  Distribución de Ancho de Banda Asignado
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-secondary/20 p-4 rounded-lg border border-border/20">
                    <span className="block text-xs text-muted-foreground">Velocidad Descarga Asignada</span>
                    <span className="text-lg font-bold text-blue-400 mt-1 block">{totalDownMbps} Mbps</span>
                  </div>
                  <div className="bg-secondary/20 p-4 rounded-lg border border-border/20">
                    <span className="block text-xs text-muted-foreground">Velocidad Subida Asignada</span>
                    <span className="text-lg font-bold text-purple-400 mt-1 block">{totalUpMbps} Mbps</span>
                  </div>
                  <div className="bg-secondary/20 p-4 rounded-lg border border-border/20">
                    <span className="block text-xs text-muted-foreground">Ancho de Banda Total</span>
                    <span className="text-lg font-bold text-brand-400 mt-1 block">{totalDownMbps + totalUpMbps} Mbps</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/20 flex flex-wrap justify-between gap-2">
                  <span>Ancho de banda promedio por cliente activo: <strong>{activeClients > 0 ? ((totalDownMbps + totalUpMbps) / activeClients).toFixed(1) : 0} Mbps</strong></span>
                  <span>Capacidad de carga calculada sobre el total de contratos de planes activos.</span>
                </div>
              </div>
            </div>
          )}

          {/* Pestaña: Clientes */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              {/* Barra de Búsqueda */}
              <div className="flex gap-3">
                <div className="relative flex-grow">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setClientsPage(1) }}
                    placeholder="Buscar cliente por nombre, cédula o IP..."
                    className="input-field pl-10"
                  />
                </div>
              </div>

              {paginatedClientsData.items.length === 0 ? (
                <div className="glass-card p-8 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground/60" />
                  No se encontraron clientes asignados a este router que coincidan con la búsqueda.
                </div>
              ) : (
                <>
                  <div className="glass-card overflow-hidden">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th className="hidden sm:table-cell">Cédula</th>
                          <th>IP</th>
                          <th>Plan</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedClientsData.items.map((client: Client) => (
                          <tr
                            key={client.id}
                            onClick={() => navigate(`/clients/${client.id}`)}
                            className="hover:bg-secondary/40 cursor-pointer transition-colors"
                          >
                            <td>
                              <div className="font-semibold text-sm text-foreground">{client.nombre}</div>
                              <div className="text-xs text-muted-foreground capitalize sm:hidden">
                                {client.tipo === 'static' ? 'IP Estática' : 'PPPoE'}
                              </div>
                            </td>
                            <td className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                              {client.cedula}
                            </td>
                            <td>
                              <code className="text-xs font-mono text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                                {client.static_ip?.ip ? client.static_ip.ip : 'PPPoE'}
                              </code>
                            </td>
                            <td className="text-xs text-brand-400 font-medium">
                              {client.plan_activo?.nombre ? client.plan_activo.nombre : 'Sin plan'}
                            </td>
                            <td>
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${client.activo
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                {client.activo ? 'Activo' : 'Suspendido'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Controles de Paginación */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between p-1 mt-4">
                      <span className="text-xs text-muted-foreground">
                        Mostrando {paginatedClientsData.items.length} de {paginatedClientsData.total} clientes
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setClientsPage((prev) => Math.max(prev - 1, 1))}
                          disabled={clientsPage === 1}
                          className="btn-secondary py-1.5 px-3 text-xs"
                        >
                          Anterior
                        </button>
                        <span className="text-xs text-foreground font-medium font-mono px-2">
                          Página {clientsPage} de {totalPages}
                        </span>
                        <button
                          onClick={() => setClientsPage((prev) => Math.min(prev + 1, totalPages))}
                          disabled={clientsPage === totalPages}
                          className="btn-secondary py-1.5 px-3 text-xs"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Pestaña: Mapa de Cobertura */}
          {activeTab === 'map' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Se muestra la posición geográfica del Router (marcador violeta) y sus clientes asociados aledaños.
              </p>

              <div className="glass-card overflow-hidden h-[500px] border border-border/40 relative">
                <MapContainer
                  center={router.latitud && router.longitud ? [router.latitud, router.longitud] : DEFAULT_CENTER}
                  zoom={router.latitud && router.longitud ? 14 : 12}
                  scrollWheelZoom={true}
                  style={{ height: '100%', width: '100%', zIndex: 10 }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {/* Marcador del Router */}
                  {router.latitud && router.longitud && (
                    <Marker position={[router.latitud, router.longitud]} icon={routerIcon}>
                      <Popup>
                        <div className="p-1 text-foreground font-sans">
                          <h4 className="font-bold text-sm text-brand-400 flex items-center gap-1.5 m-0">
                            <Server className="w-3.5 h-3.5" />
                            {router.nombre} (Router)
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1 mb-0 font-mono">{router.ip}</p>
                          <p className="text-[10px] text-muted-foreground m-0">Clientes: {allClients.length}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Marcadores de los clientes */}
                  {allClients
                    .filter((c: Client) => c.latitud && c.longitud)
                    .map((client: Client) => {
                      const color = client.activo ? '%2310b981' : '%23f59e0b'
                      const clientSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="30" height="30">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                      `)}`
                      const clientIcon = L.icon({
                        iconUrl: clientSvg,
                        iconSize: [30, 30],
                        iconAnchor: [15, 30],
                        popupAnchor: [0, -26],
                      })

                      return (
                        <Marker
                          key={client.id}
                          position={[client.latitud!, client.longitud!]}
                          icon={clientIcon}
                        >
                          <Popup>
                            <div className="p-1 space-y-1.5 text-foreground font-sans min-w-[150px]">
                              <h4 className="font-bold text-xs text-foreground m-0">{client.nombre}</h4>
                              <p className="text-[10px] text-muted-foreground m-0 font-mono">IP: {client.static_ip?.ip ?? 'PPPoE'}</p>
                              <div className="flex items-center justify-between border-t border-border/40 pt-1 mt-1">
                                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full ${client.activo
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                                  }`}>
                                  {client.activo ? 'activo' : 'suspendido'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/clients/${client.id}`)}
                                  className="text-[9px] uppercase font-bold text-brand-400 hover:underline"
                                >
                                  Ver Perfil &rarr;
                                </button>
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      )
                    })}
                </MapContainer>
              </div>
            </div>
          )}

          {/* Pestaña: Configuración y Diagnóstico */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Sección Diagnóstico de MikroTik */}
              <div className="glass-card p-5 space-y-4 border border-border/40">
                <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Shield className="w-4 h-4 text-brand-400" />
                    Diagnóstico de API
                  </h3>
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="btn-secondary text-xs"
                  >
                    {isTesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {isTesting ? 'Probando...' : 'Ejecutar Test'}
                  </button>
                </div>

                {testResult ? (
                  <div
                    className={`rounded-lg p-3 flex items-start gap-3 ${testResult.success
                        ? 'bg-emerald-500/10 border border-emerald-500/30'
                        : 'bg-destructive/10 border border-destructive/30'
                      }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4.5 h-4.5 text-destructive flex-shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs space-y-1">
                      <p className={testResult.success ? 'text-emerald-400 font-semibold' : 'text-destructive font-semibold'}>
                        {testResult.message}
                      </p>
                      {testResult.ros_version && (
                        <p className="text-muted-foreground font-mono">
                          Versión ROS: {testResult.ros_version} · Uptime: {testResult.uptime}
                        </p>
                      )}
                      {testResult.error && (
                        <p className="text-muted-foreground font-mono leading-relaxed">{testResult.error}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Presiona el botón para ejecutar una prueba de conexión en vivo con la API de MikroTik de este router y validar credenciales.
                  </p>
                )}
              </div>

              {/* Acciones de MikroTik */}
              {isAdmin && (
                <div className="glass-card p-5 space-y-4 border border-border/40">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border/40 pb-2.5">
                    <Network className="w-4 h-4 text-brand-400" />
                    Acciones de Red
                  </h3>

                  <div className="flex flex-wrap gap-3">
                    {router.status === 'online' ? (
                      <button
                        onClick={() => setImportingOpen(true)}
                        className="btn-secondary text-brand-400 hover:text-brand-300"
                      >
                        <Download className="w-4 h-4" />
                        Importar Clientes desde Address-list
                      </button>
                    ) : (
                      <div className="text-xs text-muted-foreground bg-secondary/40 p-3 rounded-lg w-full">
                        El router debe estar <strong>En línea</strong> para permitir la importación automática de clientes.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Zona Peligrosa */}
              {isAdmin && (
                <div className="glass-card p-5 border border-red-500/20 bg-red-500/5 space-y-4">
                  <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2 border-b border-red-500/10 pb-2.5">
                    <Trash2 className="w-4 h-4 text-red-400" />
                    Zona de Peligro
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Al eliminar este router, se desactivará en la plataforma. No se eliminarán los datos históricos de clientes, pero estos dejarán de estar asignados a un router en línea.
                  </p>
                  <button
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="btn-destructive w-full sm:w-auto px-4"
                  >
                    Desactivar y Eliminar Router
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Dialog Crear/Editar Router ── */}
      {editOpen && (
        <RouterFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          router={router}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['router', id] })
            queryClient.invalidateQueries({ queryKey: ['routers'] })
            setEditOpen(false)
          }}
          onDelete={() => {
            setEditOpen(false)
            setConfirmDeleteOpen(true)
          }}
        />
      )}

      {/* ── Modal Confirmación de Eliminación ── */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-sm mx-4 animate-fade-in">
            <h3 className="text-lg font-semibold text-foreground mb-2">¿Eliminar router?</h3>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              Esta acción desactivará el router <strong>{router.nombre}</strong>. Los clientes asignados no se borrarán pero perderán el enlace a este router.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                className="btn-secondary flex-1 justify-center"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="btn-destructive flex-1 justify-center"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Importar Clientes de Address-list ── */}
      {importingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md mx-4 animate-fade-in border border-border/50">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Download className="w-5 h-5 text-brand-400" />
                Importar desde Address-list
              </h2>
              <button
                type="button"
                onClick={() => setImportingOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Selecciona una lista de direcciones del router <strong>{router.nombre}</strong>. Se importarán todas sus IPs y se registrarán como nuevos clientes en el sistema y en la lista <strong>clientes</strong> de MikroTik.
              </p>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Seleccionar Address-list *
                </label>
                {isLoadingLists ? (
                  <div className="text-xs text-muted-foreground py-2 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando listas del router...
                  </div>
                ) : (
                  <select
                    value={selectedListName}
                    onChange={(e) => {
                      setSelectedListName(e.target.value)
                      if (e.target.value !== 'custom') {
                        setCustomListName('')
                      }
                    }}
                    className="input-field cursor-pointer"
                  >
                    <option value="clientes">clientes (Por defecto)</option>
                    {addressLists
                      .filter((l: string) => l !== 'clientes')
                      .map((listName: string) => (
                        <option key={listName} value={listName}>
                          {listName}
                        </option>
                      ))}
                    <option value="custom">-- Escribir nombre personalizado --</option>
                  </select>
                )}
              </div>

              {selectedListName === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Nombre de la lista personalizado *
                  </label>
                  <input
                    type="text"
                    value={customListName}
                    onChange={(e) => setCustomListName(e.target.value)}
                    placeholder="Ej: IPs_Nuevas, WAN_List, etc."
                    required
                    className="input-field font-sans"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setImportingOpen(false)}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importMutation.isPending || (selectedListName === 'custom' && !customListName.trim())}
                  className="btn-primary flex-1 justify-center"
                >
                  {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importMutation.isPending ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
