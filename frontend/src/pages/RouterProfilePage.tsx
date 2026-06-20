/**
 * RouterProfilePage — Ficha del router, listado de clientes asociados, ubicación geográfica y configuración de MikroTik.
 */
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, RefreshCw, MapPin, Shield, Wifi, Server, Clock,
  CheckCircle2, XCircle, Sliders, AlertCircle, Loader2, X, Plus,
  Edit2, Trash2, Download, Search, Users, Network, Activity
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
import TrafficChart, { formatSpeed } from '@/components/TrafficChart'

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

// Helper to format a queue limit string (e.g. "10M/20M") into a friendly text (e.g. "↑ 10 MB / ↓ 20 MB")
function formatQueueLimit(maxLimit: string | undefined): string {
  if (!maxLimit || maxLimit === '0/0') return 'Ilimitado'
  const parts = maxLimit.split('/')
  if (parts.length !== 2) return maxLimit

  const formatPart = (valStr: string): string => {
    valStr = valStr.toUpperCase().trim()
    if (valStr.endsWith('G')) {
      return `${valStr.slice(0, -1)} GB`
    }
    if (valStr.endsWith('M')) {
      return `${valStr.slice(0, -1)} MB`
    }
    if (valStr.endsWith('K')) {
      return `${valStr.slice(0, -1)} KB`
    }
    const num = Number(valStr)
    if (!isNaN(num) && num > 0) {
      if (num >= 1024 * 1024 * 1024) {
        return `${(num / (1024 * 1024 * 1024)).toFixed(0)} GB`
      }
      if (num >= 1024 * 1024) {
        return `${(num / (1024 * 1024)).toFixed(0)} MB`
      }
      if (num >= 1024) {
        return `${(num / 1024).toFixed(0)} KB`
      }
      return `${num} B`
    }
    return valStr
  }

  return `↑ ${formatPart(parts[0])} / ↓ ${formatPart(parts[1])}`
}

// Helper to parse speed limits in Mbps from a queue limit string (e.g., "10M/20M")
// Returns [upload_mbps, download_mbps]
function parseMaxLimit(maxLimit: string | undefined): [number, number] {
  if (!maxLimit) return [0, 0]
  const parts = maxLimit.split('/')
  if (parts.length !== 2) return [0, 0]

  const parsePart = (valStr: string): number => {
    valStr = valStr.toUpperCase().trim()
    if (valStr.endsWith('G')) {
      return parseFloat(valStr.slice(0, -1)) * 1024
    }
    if (valStr.endsWith('M')) {
      return parseFloat(valStr.slice(0, -1))
    }
    if (valStr.endsWith('K')) {
      return parseFloat(valStr.slice(0, -1)) / 1024
    }
    const num = parseFloat(valStr)
    if (!isNaN(num)) {
      return num / 1000000
    }
    return 0
  }

  return [parsePart(parts[0]), parsePart(parts[1])]
}

// Helper to format dynamic assigned bandwidth dynamically (e.g. 1500 Mbps -> 1.5 GB)
function formatBandwidth(mbps: number): string {
  if (mbps >= 1024) {
    const gb = mbps / 1024
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`
  }
  return `${mbps.toFixed(0)} MB`
}

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

  const [activeTab, setActiveTab] = useState<'stats' | 'clients' | 'queues' | 'settings'>('stats')
  const [selectedQueue, setSelectedQueue] = useState<any | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
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
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  // Limpiar resultado de la importación cuando el modal se abre o se cierra
  useEffect(() => {
    if (!importingOpen) {
      setImportResult(null)
    }
  }, [importingOpen])

  // Ranking en vivo de clientes por consumo total
  const [liveClients, setLiveClients] = useState<any[]>([])

  useEffect(() => {
    const wsUrl = (() => {
      const token = localStorage.getItem('access_token') || ''
      const apiHost = import.meta.env.VITE_API_URL
      let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      let wsHost = window.location.host
      if (apiHost) {
        try {
          const url = new URL(apiHost)
          wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
          wsHost = url.host
        } catch { }
      }
      return `${wsProtocol}//${wsHost}/api/traffic/ws/${id}?token=${token}`
    })()

    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        const clients = payload.clients || []
        const sortedClients = [...clients].sort((a: any, b: any) => (b.rx_rate + b.tx_rate) - (a.rx_rate + a.tx_rate))
        setLiveClients(sortedClients)
      } catch (err) {
        console.error('Error al procesar mensaje de tráfico en vivo:', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [id])



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

  // Consultar colas asociadas
  const { data: queues = [], isLoading: isLoadingQueues, refetch: refetchQueues } = useQuery({
    queryKey: ['router-queues', id],
    queryFn: async () => {
      const { data } = await api.get(`/routers/${id}/queues`)
      return data
    }
  })

  // Consultar todos los planes disponibles (para cambiar plan en modal)
  const { data: plans = [] } = useQuery({
    queryKey: ['plans-all'],
    queryFn: async () => {
      const { data } = await api.get('/plans')
      return data
    },
    enabled: activeTab === 'queues',
  })

  // Mutación para activar/desactivar cola
  const toggleQueueMutation = useMutation({
    mutationFn: async ({ clientId, disabled }: { clientId: string; disabled: boolean }) => {
      await api.post(`/clients/${clientId}/toggle-queue`, null, {
        params: { disabled }
      })
    },
    onSuccess: () => {
      refetchQueues()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Error al cambiar estado de la cola'
      alert(msg)
    }
  })

  // Mutación para cambiar plan al vuelo
  const changePlanMutation = useMutation({
    mutationFn: async ({ clientId, planId }: { clientId: string; planId: string }) => {
      await api.post(`/clients/${clientId}/assign-plan`, null, {
        params: { plan_id: planId }
      })
    },
    onSuccess: () => {
      refetchQueues()
      setSelectedQueue(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Error al cambiar plan en tiempo real'
      alert(msg)
    }
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
      setImportResult({
        success: true,
        message: `Importación exitosa. Se importaron ${data.imported_count} nuevos clientes.`
      })
      setSelectedListName('clientes')
      setCustomListName('')
      queryClient.invalidateQueries({ queryKey: ['router-clients-paginated', id] })
      queryClient.invalidateQueries({ queryKey: ['router-clients-all', id] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Error al importar clientes desde el router.'
      setImportResult({
        success: false,
        message: msg
      })
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

  // Función para sincronizar de manera completa todos los datos
  const handleSyncAll = () => {
    refetchRouter()
    refetchQueues()
    queryClient.invalidateQueries({ queryKey: ['router', id] })
    queryClient.invalidateQueries({ queryKey: ['router-queues', id] })
  }

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

  // Calcular ancho de banda dinámicamente desde las colas de MikroTik
  const activeQueues = queues.filter((q: any) => {
    if (q.disabled) return false
    const name = q.name?.toLowerCase() || ''

    // Filtrar dinámicamente la cola padre del router
    const routerParent = router?.cola_padre?.toLowerCase() || ''
    if (routerParent && name === routerParent) return false

    // Filtros legados
    if (name === 'isp_padre' || name === 'padre' || name === 'total') return false
    if (name.startsWith('isp_padre_')) return false
    return true
  })

  // Encontrar la cola padre del router en las colas traídas de MikroTik
  const routerParentName = router?.cola_padre?.toLowerCase() || ''
  const parentQueue = queues.find((q: any) => {
    const qName = q.name?.toLowerCase() || ''
    if (routerParentName && qName === routerParentName) return true
    if (!routerParentName && (qName === 'isp_padre' || qName === 'padre' || qName === 'total')) return true
    return false
  })

  // Extraer límites de velocidad del router (Prioridad: MikroTik parent queue max_limit > base de datos fallback)
  let configuredDownMbps = router?.ancho_banda_down || 0
  let configuredUpMbps = router?.ancho_banda_up || 0

  if (parentQueue && parentQueue.max_limit) {
    const [upMbps, downMbps] = parseMaxLimit(parentQueue.max_limit)
    configuredUpMbps = upMbps
    configuredDownMbps = downMbps
  }

  const totalUpMbps = activeQueues.reduce((acc: number, q: any) => {
    const [up] = parseMaxLimit(q.max_limit)
    return acc + up
  }, 0)

  const totalDownMbps = activeQueues.reduce((acc: number, q: any) => {
    const [, down] = parseMaxLimit(q.max_limit)
    return acc + down
  }, 0)

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
            onClick={handleSyncAll}
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
              <div className="space-y-3 text-xs">

                {/* Mapa adaptado dentro de la tarjeta de coordenadas */}
                <div className="rounded-lg overflow-hidden h-[240px] border border-border/40 relative shadow-sm z-10">
                  <MapContainer
                    center={[router.latitud, router.longitud]}
                    zoom={13}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Marcador del Router */}
                    <Marker position={[router.latitud, router.longitud]} icon={routerIcon}>
                      <Popup>
                        <div className="p-1 text-foreground font-sans">
                          <h4 className="font-bold text-sm text-brand-400 flex items-center gap-1.5 m-0">
                            <Server className="w-3.5 h-3.5" />
                            {router.nombre}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1 mb-0 font-mono">{router.ip}</p>
                          <p className="text-[10px] text-muted-foreground m-0">Clientes: {allClients.length}</p>
                        </div>
                      </Popup>
                    </Marker>

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
                          iconSize: [26, 26],
                          iconAnchor: [13, 26],
                          popupAnchor: [0, -22],
                        })

                        return (
                          <Marker
                            key={client.id}
                            position={[client.latitud!, client.longitud!]}
                            icon={clientIcon}
                          >
                            <Popup>
                              <div className="p-1 space-y-1.5 text-foreground font-sans min-w-[140px]">
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
                                    Ver Perfil
                                  </button>
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        )
                      })}
                  </MapContainer>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latitud:</span>
                    <span className="font-mono text-foreground font-semibold">{router.latitud}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Longitud:</span>
                    <span className="font-mono text-foreground font-semibold">{router.longitud}</span>
                  </div>
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
        </div>

        {/* Panel Principal - Tabs a la Derecha */}
        <div className="lg:col-span-2 space-y-6">
          {/* Navegación de Tabs */}
          <div className="flex border-b border-border gap-2">
            {[
              { id: 'stats', label: 'Estadísticas', icon: Network },
              { id: 'clients', label: 'Clientes Asociados', icon: Users },
              { id: 'queues', label: 'Colas de Tráfico', icon: Activity },
              { id: 'settings', label: 'Diagnóstico', icon: Sliders },
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
                    {isLoadingQueues ? (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                        <span className="text-xs text-muted-foreground">Calculando...</span>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-blue-400 mt-1 block">
                        {formatBandwidth(totalDownMbps)}
                        {configuredDownMbps ? (
                          <span className="text-[10px] text-muted-foreground block font-normal mt-0.5">
                            de {configuredDownMbps} Mbps totales ({((totalDownMbps / configuredDownMbps) * 100).toFixed(0)}%)
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground block font-normal mt-0.5">Límite router: Ilimitado</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="bg-secondary/20 p-4 rounded-lg border border-border/20">
                    <span className="block text-xs text-muted-foreground">Velocidad Subida Asignada</span>
                    {isLoadingQueues ? (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                        <span className="text-xs text-muted-foreground">Calculando...</span>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-purple-400 mt-1 block">
                        {formatBandwidth(totalUpMbps)}
                        {configuredUpMbps ? (
                          <span className="text-[10px] text-muted-foreground block font-normal mt-0.5">
                            de {configuredUpMbps} Mbps totales ({((totalUpMbps / configuredUpMbps) * 100).toFixed(0)}%)
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground block font-normal mt-0.5">Límite router: Ilimitado</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="bg-secondary/20 p-4 rounded-lg border border-border/20">
                    <span className="block text-xs text-muted-foreground">Capacidad Límite del Router</span>
                    {isLoadingRouter || isLoadingQueues ? (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                        <span className="text-xs text-muted-foreground">Cargando...</span>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-brand-400 mt-1 block">
                        {configuredDownMbps || configuredUpMbps ? (
                          <>
                            ↓ {configuredDownMbps} / ↑ {configuredUpMbps} <span className="text-xs font-semibold text-muted-foreground">Mbps</span>
                          </>
                        ) : (
                          'Ilimitado (0/0)'
                        )}
                        <span className="text-[10px] text-muted-foreground block font-normal mt-0.5">
                          Cola: <strong>{parentQueue?.name || router?.cola_padre || 'sin cola'}</strong>
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/20 flex flex-wrap justify-between gap-2">
                  <span>Ancho de banda promedio por cliente activo: <strong>{activeClients > 0 ? formatBandwidth((totalDownMbps + totalUpMbps) / activeClients) : '0 MB'}</strong></span>
                  <span>
                    {configuredDownMbps && configuredUpMbps
                      ? `Asignación de capacidad: ↓ ${((totalDownMbps / configuredDownMbps) * 100).toFixed(0)}% / ↑ ${((totalUpMbps / configuredUpMbps) * 100).toFixed(0)}% respecto al límite del Router.`
                      : 'Capacidad de carga calculada sobre las colas de tráfico activas en MikroTik.'}
                  </span>
                </div>
              </div>

              {/* Top 10 Clientes Activos por Consumo */}
              <div className="glass-card p-5 border border-border/40 space-y-4 font-sans">
                <h3 className="text-sm font-semibold text-foreground border-b border-border/40 pb-2.5 flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand-400" />
                  Top 10 Clientes Activos
                </h3>

                {liveClients.length === 0 ? (
                  <p className="text-center py-6 text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                    Cargando ranking de consumo en vivo...
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Tasa Descarga (RX)</th>
                          <th>Tasa Subida (TX)</th>
                          <th>Consumo Total (Acumulado)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveClients.slice(0, 10).map((lc: any) => (
                          <tr
                            key={lc.cliente_id}
                            onClick={() => navigate(`/clients/${lc.cliente_id}`)}
                            className="hover:bg-secondary/40 cursor-pointer transition-colors"
                          >
                            <td className="font-semibold text-sm text-foreground">
                              {lc.nombre}
                            </td>
                            <td className="font-mono text-xs text-cyan-400 font-bold">
                              {formatSpeed(lc.rx_rate)}
                            </td>
                            <td className="font-mono text-xs text-violet-400 font-bold">
                              {formatSpeed(lc.tx_rate)}
                            </td>
                            <td className="font-mono text-xs text-muted-foreground">
                              {((lc.rx_bytes + lc.tx_bytes) / (1024 * 1024)).toFixed(1)} MB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

          {/* Pestaña: Colas de Tráfico */}
          {activeTab === 'queues' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-secondary/15 p-4 rounded-xl border border-border/40">
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                  Listado de colas simples (Simple Queues) activas en el MikroTik. Las colas enlazadas a clientes locales permiten interactuar directamente para activar, desactivar o modificar sus límites de velocidad.
                </p>
                <button
                  onClick={() => refetchQueues()}
                  disabled={isLoadingQueues}
                  className="btn-secondary text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQueues ? 'animate-spin' : ''}`} />
                  Actualizar
                </button>
              </div>

              {isLoadingQueues ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
                    <span>Cargando colas de tráfico desde MikroTik...</span>
                  </div>
                </div>
              ) : queues.length === 0 ? (
                <div className="glass-card p-8 text-center text-muted-foreground">
                  <Sliders className="w-10 h-10 mx-auto mb-2 text-muted-foreground/60" />
                  No se encontraron colas simples configuradas en este router.
                </div>
              ) : (
                <div className="glass-card overflow-hidden font-sans">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Cola / Cliente</th>
                        <th>IP (Target)</th>
                        <th> Upload / Download</th>
                        <th>Tráfico actual (TX / RX)</th>
                        <th>Estado</th>
                        {isAdmin && <th className="text-right">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {queues.map((q: any) => (
                        <tr key={q.id} className="hover:bg-secondary/40 transition-colors">
                          <td>
                            {q.cliente_id ? (
                              <div
                                onClick={() => navigate(`/clients/${q.cliente_id}`)}
                                className="font-semibold text-sm text-brand-400 hover:underline cursor-pointer"
                              >
                                {q.name}
                              </div>
                            ) : (
                              <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                                {q.name}
                                <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded-full uppercase font-bold">Huérfana</span>
                              </div>
                            )}
                          </td>
                          <td>
                            <code className="text-xs font-mono text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                              {q.target}
                            </code>
                          </td>
                          <td className="text-xs font-mono font-medium text-foreground">
                            {formatQueueLimit(q.max_limit)}
                          </td>
                          <td className="text-xs font-mono text-brand-400 font-semibold">
                            {q.rate_human}
                          </td>
                          <td>
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${!q.disabled
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-destructive/10 text-destructive border border-destructive/20'
                              }`}>
                              {!q.disabled ? 'Activo' : 'Suspendido'}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {q.cliente_id && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedQueue(q)
                                        setSelectedPlanId(q.plan_activo?.id || '')
                                      }}
                                      className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 hover:text-brand-400"
                                      title="Cambiar velocidad/plan al vuelo"
                                    >
                                      <Sliders className="w-3 h-3" />
                                      Cambiar Plan
                                    </button>
                                    <button
                                      onClick={() => toggleQueueMutation.mutate({
                                        clientId: q.cliente_id,
                                        disabled: !q.disabled
                                      })}
                                      disabled={toggleQueueMutation.isPending}
                                      className={`btn-secondary py-1 px-2.5 text-xs ${!q.disabled ? 'text-destructive hover:bg-destructive/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}
                                      title={!q.disabled ? 'Deshabilitar cola' : 'Habilitar cola'}
                                    >
                                      {!q.disabled ? 'Suspender' : 'Activar'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
            queryClient.invalidateQueries({ queryKey: ['router-queues', id] })
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

            {importResult?.success ? (
              <div className="p-6 text-center space-y-4 font-sans">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto text-emerald-400 animate-fade-in">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-foreground">¡Importación Exitosa!</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed font-sans">
                    {importResult.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportingOpen(false)}
                  className="btn-primary w-full justify-center mt-2"
                >
                  Entendido
                </button>
              </div>
            ) : (
              <form onSubmit={handleImportSubmit} className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Selecciona una lista de direcciones del router <strong>{router.nombre}</strong>. Se importarán todas sus IPs y se registrarán como nuevos clientes en el sistema y en la lista <strong>clientes</strong> de MikroTik.
                </p>

                {importResult && !importResult.success && (
                  <div className="rounded-lg p-3.5 flex items-start gap-3 text-xs leading-relaxed bg-destructive/10 border border-destructive/30 text-destructive font-sans">
                    <XCircle className="w-4.5 h-4.5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-grow">
                      <p className="font-semibold text-foreground">Fallo en la importación</p>
                      <p className="mt-0.5 text-muted-foreground">{importResult.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImportResult(null)}
                      className="text-muted-foreground hover:text-foreground transition-colors ml-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

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
                      <option value="clientes">clientes</option>
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
            )}
          </div>
        </div>
      )}

      {/* ── Modal Cambiar Plan en Tiempo Real ── */}
      {selectedQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md mx-4 animate-fade-in border border-border/50">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand-400" />
                Cambiar Plan en Caliente
              </h2>
              <button
                type="button"
                onClick={() => setSelectedQueue(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 font-sans">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Estás cambiando el plan del cliente <strong>{selectedQueue.cliente_nombre}</strong> con IP <strong>{selectedQueue.target}</strong>. El límite de velocidad de MikroTik se modificará inmediatamente.
              </p>

              <div>
                <span className="block text-xs text-muted-foreground">Plan Actual</span>
                <span className="text-sm font-semibold text-foreground block">{selectedQueue.plan_activo?.nombre || 'Ninguno'}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5 font-sans">
                  Seleccionar Nuevo Plan *
                </label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="input-field cursor-pointer"
                >
                  <option value="">-- Seleccionar Plan --</option>
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} - ${p.precio}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedQueue(null)}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!selectedPlanId) return
                    changePlanMutation.mutate({
                      clientId: selectedQueue.cliente_id,
                      planId: selectedPlanId
                    })
                  }}
                  disabled={changePlanMutation.isPending || !selectedPlanId}
                  className="btn-primary flex-1 justify-center"
                >
                  {changePlanMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {changePlanMutation.isPending ? 'Cambiando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
