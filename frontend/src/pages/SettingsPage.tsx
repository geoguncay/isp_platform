/**
 * SettingsPage — Página exclusiva para configuraciones globales (MikroTik, Datos de la Empresa, Facturación, Suspensión, Métodos de Pago, Usuarios y Alertas).
 */
import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Save, SlidersHorizontal, CheckCircle2, XCircle, Building, Users, Bell, Loader2,
  Globe, Phone, MapPin, Hash, Mail, Upload, Receipt, Ban, CreditCard, Plus, Trash2,
  Edit2, Check, X, Shield, Clock, Router, UserPlus, ToggleLeft, ToggleRight,
  ClipboardList, RefreshCw, Wifi, WifiOff, LogIn, UserX, UserCheck, Server, Zap, Download,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Navigate } from 'react-router-dom'
import api from '@/services/api'
import { getLogoUrl } from '@/components/AppLayout'
import { SiteFormModal, type SiteItem } from '@/components/SiteFormModal'
import { getSystemSettings, updateBilling, updateSuspension, updateCatalogs } from '@/services/systemSettings'
import { GeneralSettingsTab } from '@/pages/settings/GeneralSettingsTab'

// ── Zod Schemas ──────────────────────────────────────────────────────────────
const companySchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(120),
  ruc: z.string().max(20).optional().or(z.literal('')),
  direccion: z.string().max(255).optional().or(z.literal('')),
  telefono: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email('Correo inválido').optional().or(z.literal('')).or(z.null()),
  sitio_web: z.string().max(255).optional().or(z.literal('')),
  logo_url: z.string().max(255).optional().or(z.literal('')).or(z.null()),
  use_logo_on_login: z.boolean().default(false),
  login_bg_url: z.string().max(255).optional().or(z.literal('')).or(z.null()),
  use_login_bg: z.boolean().default(false),
})

type CompanyFormData = z.infer<typeof companySchema>

interface PaymentMethod {
  value: string
  label: string
  isSystem?: boolean
}

interface UserItem {
  id: string
  nombre: string
  email: string
  rol: 'admin' | 'tecnico' | 'viewer'
  activo: boolean
  inactivity_timeout: number
  tipo_operador?: string
  permisos_router?: string
  horario_acceso?: string
  permisos?: string
  created_at: string
}

const userSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(120),
  email: z.string().email('Email inválido'),
  password: z.string().optional().or(z.literal('')),
  rol: z.enum(['admin', 'tecnico', 'viewer']),
  tipo_operador: z.string(),
  activo: z.boolean().default(true),
  inactivity_timeout: z.coerce.number().default(0),
  horario_inicio: z.string().default('00:00'),
  horario_fin: z.string().default('23:59'),
})

type UserFormData = z.infer<typeof userSchema>

const DISPONIBLE_PERMISOS = [
  { value: 'clientes:ver', label: 'Ver Clientes' },
  { value: 'clientes:crear', label: 'Registrar/Editar Clientes' },
  { value: 'pagos:registrar', label: 'Registrar Pagos/Cobros' },
  { value: 'facturas:administrar', label: 'Administrar Facturas' },
  { value: 'inventario:administrar', label: 'Administrar Stock/Inventario' },
  { value: 'routers:administrar', label: 'Administrar Routers' },
]

type TabType = 'general' | 'company' | 'gateway' | 'users' | 'alerts' | 'billing' | 'logs'
type NavItem = { id: TabType; icon: React.ComponentType<{ className?: string }>; label: string }

// ── Audit Log helpers ─────────────────────────────────────────────────────────
interface AuditLog {
  id: string
  usuario_id: string | null
  usuario_nombre: string | null
  accion: string
  entidad_tipo: string | null
  entidad_id: string | null
  entidad_nombre: string | null
  detalle: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

interface AuditLogListResponse {
  items: AuditLog[]
  total: number
}

const ACTION_META: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  USER_LOGIN:      { label: 'Inicio de sesión',       color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',         icon: LogIn },
  CREATE_GATEWAY:  { label: 'Gateway creado',          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: Server },
  UPDATE_GATEWAY:  { label: 'Gateway actualizado',     color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',      icon: Server },
  DELETE_GATEWAY:  { label: 'Gateway eliminado',       color: 'text-red-400 bg-red-500/10 border-red-500/20',            icon: Server },
  GATEWAY_ONLINE:  { label: 'Gateway en línea',        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: Wifi },
  GATEWAY_OFFLINE: { label: 'Gateway fuera de línea',  color: 'text-red-400 bg-red-500/10 border-red-500/20',            icon: WifiOff },
  IMPORT_CLIENTS:  { label: 'Importación clientes',    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',   icon: Download },
  CREATE_CLIENT:   { label: 'Cliente creado',          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: UserPlus },
  UPDATE_CLIENT:   { label: 'Cliente actualizado',     color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',      icon: UserCheck },
  DELETE_CLIENT:   { label: 'Cliente eliminado',       color: 'text-red-400 bg-red-500/10 border-red-500/20',            icon: UserX },
  SUSPEND_CLIENT:  { label: 'Cliente suspendido',      color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',   icon: UserX },
  ACTIVATE_CLIENT: { label: 'Cliente activado',        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: UserCheck },
  ASSIGN_PLAN:     { label: 'Plan asignado',           color: 'text-brand-400 bg-brand-500/10 border-brand-500/20',      icon: Zap },
  TOGGLE_QUEUE:    { label: 'Cola toggled',            color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',      icon: ToggleLeft },
  CREATE_PAYMENT:  { label: 'Pago registrado',         color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: Zap },
}

const ACCION_OPTIONS = Object.entries(ACTION_META).map(([value, { label }]) => ({ value, label }))

function ActionBadge({ accion }: { accion: string }) {
  const meta = ACTION_META[accion] ?? { label: accion, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: ClipboardList }
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  )
}

function LogDetailCell({ detalle }: { detalle: Record<string, unknown> | null }) {
  if (!detalle) return <span className="text-muted-foreground">—</span>
  const parts: string[] = []
  if ('motivo' in detalle) parts.push(`Motivo: ${detalle.motivo}`)
  if ('plan_nombre' in detalle) parts.push(`Plan: ${detalle.plan_nombre}`)
  if ('imported_count' in detalle) parts.push(`${detalle.imported_count} importados`)
  if ('list_name' in detalle) parts.push(`Lista: ${detalle.list_name}`)
  if ('disabled' in detalle) parts.push(detalle.disabled ? 'Deshabilitada' : 'Habilitada')
  if ('ip' in detalle) parts.push(`IP: ${detalle.ip}`)
  return <span className="text-xs text-muted-foreground">{parts.join(' · ') || '—'}</span>
}

export function SettingsPage() {
  const { user: currentUser } = useAuthStore()
  const isAdmin = currentUser?.rol === 'admin'
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [generalSubTab, setGeneralSubTab] = useState<'billing' | 'suspension' | 'payment_methods'>('billing')
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)


  // Estados para Métodos de Pago
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [newMethodLabel, setNewMethodLabel] = useState('')
  const [editingValue, setEditingValue] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const [billingDirty, setBillingDirty] = useState(false)
  const [suspensionDirty, setSuspensionDirty] = useState(false)

  // Estados para Fechas de Corte
  const [fechasCorte, setFechasCorte] = useState<number[]>([])
  const [newFechaCorteInput, setNewFechaCorteInput] = useState('')
  const [editingFechaCorteDay, setEditingFechaCorteDay] = useState<number | null>(null)
  const [editingFechaCorteVal, setEditingFechaCorteVal] = useState('')

  // Estados para Motivos de Suspensión
  const [suspensionMotivos, setSuspensionMotivos] = useState<string[]>([])
  const [newMotivo, setNewMotivo] = useState('')

  // Estados locales para MikroTik API (sincronizados desde la DB vía useQuery)
  const [mikrotikAttempts, setMikrotikAttempts] = useState(1)
  const [mikrotikTimeout, setMikrotikTimeout] = useState(10)
  const [mikrotikDebug, setMikrotikDebug] = useState(false)
  const [mikrotikSsl, setMikrotikSsl] = useState(false)

  // Estados para listas MikroTik (Colas Padre y Address Lists)
  const [colasPadre, setColasPadre] = useState<string[]>([])
  const [newColaPadre, setNewColaPadre] = useState('')
  const [editingColaPadre, setEditingColaPadre] = useState<string | null>(null)
  const [editingColaPadreVal, setEditingColaPadreVal] = useState('')

  const [addressLists, setAddressLists] = useState<string[]>([])
  const [newAddressList, setNewAddressList] = useState('')
  const [editingAddressList, setEditingAddressList] = useState<string | null>(null)
  const [editingAddressListVal, setEditingAddressListVal] = useState('')

  // Estados para gestión de Sitios (Sites)
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<{ id: string; nombre: string } | null>(null)
  const [siteModalOpen, setSiteModalOpen] = useState(false)
  const [siteModalSite, setSiteModalSite] = useState<SiteItem | null>(null)

  // Estados para Log del Sistema
  const [logPage, setLogPage] = useState(1)
  const [logFilterAccion, setLogFilterAccion] = useState('')
  const [logFilterEntidad, setLogFilterEntidad] = useState('')

  // Estados para Modal de Usuario
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [selectedRouters, setSelectedRouters] = useState<string[]>([])
  const [selectedPermisos, setSelectedPermisos] = useState<string[]>([])

  // ── MikroTik API: carga desde DB ────────────────────────────────────────────
  const { data: mikrotikConfig } = useQuery({
    queryKey: ['mikrotik-api-config'],
    queryFn: async () => {
      const { data } = await api.get('/settings/mikrotik-api')
      return data
    },
    enabled: activeTab === 'gateway' && isAdmin,
  })

  useEffect(() => {
    if (mikrotikConfig) {
      setMikrotikAttempts(mikrotikConfig.mikrotik_attempts)
      setMikrotikTimeout(mikrotikConfig.mikrotik_timeout)
      setMikrotikDebug(mikrotikConfig.mikrotik_debug)
      setMikrotikSsl(mikrotikConfig.mikrotik_ssl)
    }
  }, [mikrotikConfig])

  const mikrotikDirty = !!mikrotikConfig && (
    mikrotikAttempts !== mikrotikConfig.mikrotik_attempts ||
    mikrotikTimeout !== mikrotikConfig.mikrotik_timeout ||
    mikrotikDebug !== mikrotikConfig.mikrotik_debug ||
    mikrotikSsl !== mikrotikConfig.mikrotik_ssl
  )

  const mikrotikApiMutation = useMutation({
    mutationFn: async (payload: object) => {
      const { data } = await api.put('/settings/mikrotik-api', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mikrotik-api-config'] })
      setStatusMessage({ type: 'success', text: 'Configuración de MikroTik API guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar configuración.' })
    },
  })

  const handleSaveMikrotikApi = () => {
    mikrotikApiMutation.mutate({
      mikrotik_timeout: mikrotikTimeout,
      mikrotik_attempts: mikrotikAttempts,
      mikrotik_debug: mikrotikDebug,
      mikrotik_ssl: mikrotikSsl,
    })
  }

  // ── Ajustes de Sistema: carga agregada desde DB (localización, fiscal, notificaciones, seguridad, mantenimiento, integraciones, facturación, suspensión, catálogos) ──
  const systemSettingsQuery = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
    enabled: isAdmin,
  })
  const billingData = systemSettingsQuery.data?.billing
  const suspensionData = systemSettingsQuery.data?.suspension

  const billingMutation = useMutation({
    mutationFn: updateBilling,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] })
      setBillingDirty(false)
      setStatusMessage({ type: 'success', text: 'Las políticas de facturación global se actualizaron correctamente.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la facturación.' })
    },
  })

  const suspensionMutation = useMutation({
    mutationFn: updateSuspension,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-settings'] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la suspensión.' })
    },
  })

  const catalogsMutation = useMutation({
    mutationFn: updateCatalogs,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-settings'] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar el catálogo.' })
    },
  })

  const LOG_LIMIT = 50
  const { data: logsData, isLoading: logsLoading, isFetching: logsFetching, refetch: refetchLogs } = useQuery<AuditLogListResponse>({
    queryKey: ['audit-logs', logPage, logFilterAccion, logFilterEntidad],
    queryFn: async () => {
      const params: Record<string, string | number> = { skip: (logPage - 1) * LOG_LIMIT, limit: LOG_LIMIT }
      if (logFilterAccion) params.accion = logFilterAccion
      if (logFilterEntidad) params.entidad_tipo = logFilterEntidad
      const { data } = await api.get('/audit-logs', { params })
      return data
    },
    enabled: activeTab === 'logs',
    refetchInterval: activeTab === 'logs' ? 30_000 : false,
  })
  const logTotalPages = Math.ceil((logsData?.total ?? 0) / LOG_LIMIT)

  // Redirigir si no es administrador
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  // Cargar Motivos de Suspensión al activar pestaña (desde DB)
  useEffect(() => {
    if (activeTab === 'billing' && generalSubTab === 'suspension' && systemSettingsQuery.data) {
      const loaded = systemSettingsQuery.data.suspension.suspension_motivos
      const defaults = ['Falta de pago', 'Solicitud del cliente', 'Mantenimiento', 'Incumplimiento de contrato']
      if (loaded && loaded.length > 0) {
        setSuspensionMotivos(loaded)
      } else {
        setSuspensionMotivos(defaults)
        suspensionMutation.mutate({ suspension_motivos: defaults })
      }
    }
  }, [activeTab, generalSubTab, systemSettingsQuery.data])

  // Cargar Fechas de Corte al activar pestaña (desde DB)
  useEffect(() => {
    if (activeTab === 'billing' && generalSubTab === 'payment_methods' && systemSettingsQuery.data) {
      const loaded = systemSettingsQuery.data.catalogs.fechas_corte
      const defaults = [1, 5, 10, 15, 28]
      if (loaded && loaded.length > 0) {
        setFechasCorte(loaded)
      } else {
        setFechasCorte(defaults)
        catalogsMutation.mutate({ fechas_corte: defaults })
      }
    }
  }, [activeTab, generalSubTab, systemSettingsQuery.data])

  // Cargar Métodos de Pago al activar pestaña (desde DB)
  useEffect(() => {
    if (activeTab === 'billing' && generalSubTab === 'payment_methods' && systemSettingsQuery.data) {
      const loaded = systemSettingsQuery.data.catalogs.payment_methods
      const defaults: PaymentMethod[] = [
        { value: 'efectivo', label: 'Efectivo', isSystem: true },
        { value: 'transferencia', label: 'Transferencia', isSystem: true },
        { value: 'tarjeta', label: 'Tarjeta', isSystem: true },
        { value: 'deposito', label: 'Depósito', isSystem: true }
      ]
      if (loaded && loaded.length > 0) {
        const withSystemFlag = loaded.map(p => {
          if (['efectivo', 'transferencia', 'tarjeta', 'deposito'].includes(p.value)) {
            return { ...p, isSystem: true }
          }
          return p
        })
        setPaymentMethods(withSystemFlag)
      } else {
        setPaymentMethods(defaults)
        catalogsMutation.mutate({ payment_methods: defaults })
      }
    }
  }, [activeTab, generalSubTab, systemSettingsQuery.data])

  // Cargar listas locales del tab gateway al activar pestaña (desde DB)
  useEffect(() => {
    if (activeTab === 'gateway' && systemSettingsQuery.data) {
      setColasPadre(systemSettingsQuery.data.catalogs.colas_padre || [])
      setAddressLists(systemSettingsQuery.data.catalogs.address_lists || [])
    }
  }, [activeTab, systemSettingsQuery.data])


  // ── Handlers Motivos de Suspensión ─────────────────────────────────────────
  const handleAddMotivo = (e: React.FormEvent) => {
    e.preventDefault()
    const val = newMotivo.trim()
    if (!val) return
    if (suspensionMotivos.includes(val)) {
      setStatusMessage({ type: 'error', text: 'Este motivo ya existe.' })
      return
    }
    const updated = [...suspensionMotivos, val]
    setSuspensionMotivos(updated)
    suspensionMutation.mutate({ suspension_motivos: updated })
    setNewMotivo('')
    setStatusMessage({ type: 'success', text: `Motivo "${val}" agregado.` })
  }

  const handleDeleteMotivo = (val: string) => {
    const updated = suspensionMotivos.filter((m) => m !== val)
    setSuspensionMotivos(updated)
    suspensionMutation.mutate({ suspension_motivos: updated })
    setStatusMessage({ type: 'success', text: 'Motivo eliminado.' })
  }

  // ── Handlers Colas Padre ────────────────────────────────────────────────────
  const handleAddColaPadre = (e: React.FormEvent) => {
    e.preventDefault()
    const val = newColaPadre.trim()
    if (!val) return
    if (colasPadre.includes(val)) {
      setStatusMessage({ type: 'error', text: 'Esa cola padre ya existe.' }); return
    }
    const updated = [...colasPadre, val]
    setColasPadre(updated)
    catalogsMutation.mutate({ colas_padre: updated })
    setNewColaPadre('')
    setStatusMessage({ type: 'success', text: `Cola padre "${val}" agregada.` })
  }
  const handleDeleteColaPadre = (val: string) => {
    const updated = colasPadre.filter(c => c !== val)
    setColasPadre(updated)
    catalogsMutation.mutate({ colas_padre: updated })
    setStatusMessage({ type: 'success', text: 'Cola padre eliminada.' })
  }
  const handleSaveColaPadre = (old: string) => {
    const val = editingColaPadreVal.trim()
    if (!val) return
    const updated = colasPadre.map(c => c === old ? val : c)
    setColasPadre(updated)
    catalogsMutation.mutate({ colas_padre: updated })
    setEditingColaPadre(null)
    setStatusMessage({ type: 'success', text: 'Cola padre actualizada.' })
  }

  // ── Handlers Address Lists ──────────────────────────────────────────────────
  const handleAddAddressList = (e: React.FormEvent) => {
    e.preventDefault()
    const val = newAddressList.trim()
    if (!val) return
    if (addressLists.includes(val)) {
      setStatusMessage({ type: 'error', text: 'Esa Address List ya existe.' }); return
    }
    const updated = [...addressLists, val]
    setAddressLists(updated)
    catalogsMutation.mutate({ address_lists: updated })
    setNewAddressList('')
    setStatusMessage({ type: 'success', text: `Address List "${val}" agregada.` })
  }
  const handleDeleteAddressList = (val: string) => {
    const updated = addressLists.filter(a => a !== val)
    setAddressLists(updated)
    catalogsMutation.mutate({ address_lists: updated })
    setStatusMessage({ type: 'success', text: 'Address List eliminada.' })
  }
  const handleSaveAddressList = (old: string) => {
    const val = editingAddressListVal.trim()
    if (!val) return
    const updated = addressLists.map(a => a === old ? val : a)
    setAddressLists(updated)
    catalogsMutation.mutate({ address_lists: updated })
    setEditingAddressList(null)
    setStatusMessage({ type: 'success', text: 'Address List actualizada.' })
  }

  // ── Formulario de Empresa ───────────────────────────────────────────────────
  const {
    data: companyData,
    isLoading: loadingCompany,
  } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await api.get('/company')
      return data
    },
    enabled: activeTab === 'company',
  })

  const {
    register: registerCompany,
    handleSubmit: handleSubmitCompany,
    reset: resetCompany,
    setValue: setValueCompany,
    watch: watchCompany,
    formState: { errors: companyErrors },
  } = useForm<CompanyFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(companySchema) as any,
  })

  const watchLogoUrl = watchCompany('logo_url')
  const watchLoginBgUrl = watchCompany('login_bg_url')
  const [isCompanyDirty, setIsCompanyDirty] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingLoginBg, setUploadingLoginBg] = useState(false)
  const [showManualUrl, setShowManualUrl] = useState(false)

  useEffect(() => {
    if (companyData) {
      resetCompany({
        nombre: companyData.nombre,
        ruc: companyData.ruc || '',
        direccion: companyData.direccion || '',
        telefono: companyData.telefono || '',
        email: companyData.email || '',
        sitio_web: companyData.sitio_web || '',
        logo_url: companyData.logo_url || '',
        use_logo_on_login: companyData.use_logo_on_login ?? false,
        login_bg_url: companyData.login_bg_url || '',
        use_login_bg: companyData.use_login_bg ?? false,
      })
      if (companyData.logo_url && (companyData.logo_url.startsWith('http://') || companyData.logo_url.startsWith('https://'))) {
        setShowManualUrl(true)
      }
      setIsCompanyDirty(false)
    }
  }, [companyData, resetCompany])

  const companyMutation = useMutation({
    mutationFn: async (data: CompanyFormData) => {
      const cleanData = { ...data }
      if (cleanData.email === '') cleanData.email = null
      if (cleanData.logo_url === '') cleanData.logo_url = null
      if (cleanData.login_bg_url === '') cleanData.login_bg_url = null
      await api.put('/company', cleanData)
    },
    onSuccess: () => {
      setIsCompanyDirty(false)
      setStatusMessage({ type: 'success', text: 'Datos de la empresa actualizados exitosamente' })
      queryClient.invalidateQueries({ queryKey: ['company'] })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      const errMsg = err?.response?.data?.detail || 'Error al actualizar los datos de la empresa'
      setStatusMessage({ type: 'error', text: errMsg })
    },
  })

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
    if (!validTypes.includes(file.type)) {
      setStatusMessage({
        type: 'error',
        text: 'Solo se permiten imágenes (PNG, JPG, JPEG, WEBP, SVG)',
      })
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setUploadingLogo(true)
    setStatusMessage(null)

    try {
      const { data } = await api.post('/company/logo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      setValueCompany('logo_url', data.logo_url)
      setIsCompanyDirty(true)
      queryClient.invalidateQueries({ queryKey: ['company'] })
      setStatusMessage({ type: 'success', text: 'Logo de la empresa subido correctamente' })
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || 'Error al subir el logo'
      setStatusMessage({ type: 'error', text: errMsg })
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const handleLoginBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setStatusMessage({ type: 'error', text: 'Solo se permiten imágenes (PNG, JPG, JPEG, WEBP)' })
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    setUploadingLoginBg(true)
    setStatusMessage(null)

    try {
      const { data } = await api.post('/company/login-bg', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setValueCompany('login_bg_url', data.login_bg_url)
      setIsCompanyDirty(true)
      queryClient.invalidateQueries({ queryKey: ['company'] })
      setStatusMessage({ type: 'success', text: 'Fondo de inicio de sesión subido correctamente' })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.response?.data?.detail || 'Error al subir el fondo' })
    } finally {
      setUploadingLoginBg(false)
      e.target.value = ''
    }
  }

  // ── Handlers Fechas de Corte ────────────────────────────────────────────────
  const handleAddFechaCorte = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseInt(newFechaCorteInput.trim(), 10)
    if (isNaN(val) || val < 1 || val > 31) {
      setStatusMessage({ type: 'error', text: 'Ingrese un día válido entre 1 y 31.' })
      return
    }
    if (fechasCorte.includes(val)) {
      setStatusMessage({ type: 'error', text: `El día ${val} ya está en la lista.` })
      return
    }
    const updated = [...fechasCorte, val].sort((a, b) => a - b)
    setFechasCorte(updated)
    catalogsMutation.mutate({ fechas_corte: updated })
    setNewFechaCorteInput('')
    setStatusMessage({ type: 'success', text: `Día ${val} agregado como fecha de corte.` })
  }

  const handleDeleteFechaCorte = (day: number) => {
    const updated = fechasCorte.filter((d) => d !== day)
    setFechasCorte(updated)
    catalogsMutation.mutate({ fechas_corte: updated })
    setStatusMessage({ type: 'success', text: `Día ${day} eliminado.` })
  }

  const handleSaveFechaCorte = (oldDay: number) => {
    const val = parseInt(editingFechaCorteVal.trim(), 10)
    if (isNaN(val) || val < 1 || val > 31) {
      setStatusMessage({ type: 'error', text: 'Ingrese un día válido entre 1 y 31.' })
      return
    }
    if (val !== oldDay && fechasCorte.includes(val)) {
      setStatusMessage({ type: 'error', text: `El día ${val} ya existe en la lista.` })
      return
    }
    const updated = fechasCorte.map((d) => (d === oldDay ? val : d)).sort((a, b) => a - b)
    setFechasCorte(updated)
    catalogsMutation.mutate({ fechas_corte: updated })
    setEditingFechaCorteDay(null)
    setStatusMessage({ type: 'success', text: `Fecha de corte actualizada a día ${val}.` })
  }

  // Metodos de pago handlers
  const handleAddPaymentMethod = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMethodLabel.trim()) return

    const cleanLabel = newMethodLabel.trim()
    const cleanValue = cleanLabel
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/(^_|_$)/g, '')

    if (!cleanValue) {
      setStatusMessage({ type: 'error', text: 'El nombre del método de pago no es válido.' })
      return
    }

    if (paymentMethods.some(p => p.value === cleanValue)) {
      setStatusMessage({ type: 'error', text: 'Este método de pago ya existe.' })
      return
    }

    const updated = [...paymentMethods, { value: cleanValue, label: cleanLabel }]
    setPaymentMethods(updated)
    catalogsMutation.mutate({ payment_methods: updated })
    setNewMethodLabel('')
    setStatusMessage({ type: 'success', text: `Método de pago "${cleanLabel}" agregado correctamente.` })
  }

  const handleDeletePaymentMethod = (valueToDelete: string) => {
    const method = paymentMethods.find(p => p.value === valueToDelete)
    if (method?.isSystem) {
      setStatusMessage({ type: 'error', text: 'No se pueden eliminar los métodos del sistema por defecto.' })
      return
    }

    const updated = paymentMethods.filter(p => p.value !== valueToDelete)
    setPaymentMethods(updated)
    catalogsMutation.mutate({ payment_methods: updated })
    setStatusMessage({ type: 'success', text: 'Método de pago eliminado correctamente.' })
  }

  const handleSaveEdit = (value: string) => {
    if (!editingLabel.trim()) return

    const updated = paymentMethods.map(p => {
      if (p.value === value) {
        return { ...p, label: editingLabel.trim() }
      }
      return p
    })

    setPaymentMethods(updated)
    catalogsMutation.mutate({ payment_methods: updated })
    setEditingValue(null)
    setStatusMessage({ type: 'success', text: 'Método de pago actualizado correctamente.' })
  }

  // ── Gestión de Sitios: Data Fetching ──────────────────────────────────────────
  const { data: sitesList = [], isLoading: loadingSites } = useQuery<SiteItem[]>({
    queryKey: ['sites-list'],
    queryFn: async () => { const { data } = await api.get('/sites'); return data },
    enabled: activeTab === 'gateway',
  })

  const deleteSiteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/sites/${id}`) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites-list'] }),
  })

  // ── Gestión de Usuarios: Data Fetching ─────────────────────────────────────────
  const { data: usersList = [], refetch: refetchUsers, isLoading: loadingUsers } = useQuery<UserItem[]>({
    queryKey: ['users-list'],
    queryFn: async () => {
      const { data } = await api.get('/users')
      return data
    },
    enabled: activeTab === 'users',
  })

  const { data: routers = [] } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['routers-list-settings'],
    queryFn: async () => {
      const { data } = await api.get('/gateways')
      return data
    },
    enabled: activeTab === 'users',
  })



  const {
    register: registerUser,
    handleSubmit: handleSubmitUser,
    reset: resetUser,
    setValue: setValueUser,
    watch: watchUser,
    formState: { errors: userErrors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema) as any,
    defaultValues: {
      rol: 'viewer',
      tipo_operador: 'soporte_tecnico',
      activo: true,
      inactivity_timeout: 0,
      horario_inicio: '00:00',
      horario_fin: '23:59',
    }
  })

  const watchOperatorType = watchUser('tipo_operador')

  // Auto-map operator type to standard role and default permissions
  useEffect(() => {
    if (watchOperatorType === 'administrador') {
      setValueUser('rol', 'admin')
      setSelectedPermisos(DISPONIBLE_PERMISOS.map(p => p.value))
    } else if (watchOperatorType === 'operador_pagos') {
      setValueUser('rol', 'viewer')
      setSelectedPermisos(['pagos:registrar', 'clientes:ver'])
    } else if (watchOperatorType === 'instalador') {
      setValueUser('rol', 'tecnico')
      setSelectedPermisos(['clientes:ver', 'clientes:crear'])
    } else if (watchOperatorType === 'soporte_tecnico') {
      setValueUser('rol', 'tecnico')
      setSelectedPermisos(['clientes:ver', 'clientes:crear', 'routers:administrar'])
    }
  }, [watchOperatorType, setValueUser])

  const userMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const payload: any = {
        nombre: data.nombre,
        email: data.email,
        rol: data.rol,
        activo: data.activo,
        inactivity_timeout: data.inactivity_timeout,
        tipo_operador: data.tipo_operador,
        permisos_router: selectedRouters.join(','),
        horario_acceso: `${data.horario_inicio}-${data.horario_fin}`,
        permisos: selectedPermisos.join(','),
      }

      if (data.password && data.password.trim() !== '') {
        payload.password = data.password
      }

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, payload)
      } else {
        if (!data.password) {
          throw new Error('La contraseña es obligatoria para nuevos usuarios')
        }
        await api.post('/users', payload)
      }
    },
    onSuccess: () => {
      setStatusMessage({
        type: 'success',
        text: editingUser ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.'
      })
      setIsUserModalOpen(false)
      setEditingUser(null)
      refetchUsers()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.message || 'Error al guardar usuario'
      setStatusMessage({ type: 'error', text: msg })
    }
  })

  const handleOpenCreateUser = () => {
    setEditingUser(null)
    resetUser({
      nombre: '',
      email: '',
      password: '',
      rol: 'viewer',
      tipo_operador: 'soporte_tecnico',
      activo: true,
      inactivity_timeout: 0,
      horario_inicio: '08:00',
      horario_fin: '18:00',
    })
    setSelectedRouters([])
    setSelectedPermisos(['clientes:ver', 'clientes:crear', 'routers:administrar'])
    setIsUserModalOpen(true)
  }

  const handleOpenEditUser = (u: UserItem) => {
    setEditingUser(u)
    let start = '00:00'
    let end = '23:59'
    if (u.horario_acceso && u.horario_acceso.includes('-')) {
      const split = u.horario_acceso.split('-')
      start = split[0]
      end = split[1]
    }
    resetUser({
      nombre: u.nombre,
      email: u.email,
      password: '',
      rol: u.rol,
      tipo_operador: u.tipo_operador || 'soporte_tecnico',
      activo: u.activo,
      inactivity_timeout: u.inactivity_timeout,
      horario_inicio: start,
      horario_fin: end,
    })
    setSelectedRouters(u.permisos_router ? u.permisos_router.split(',') : [])
    setSelectedPermisos(u.permisos ? u.permisos.split(',') : [])
    setIsUserModalOpen(true)
  }

  const handleDeleteUser = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este operador del sistema?')) return
    try {
      await api.delete(`/users/${id}`)
      setStatusMessage({ type: 'success', text: 'Operador eliminado exitosamente.' })
      refetchUsers()
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Error al eliminar usuario.' })
    }
  }

  const handleToggleUserStatus = async (u: UserItem) => {
    try {
      await api.put(`/users/${u.id}`, { activo: !u.activo })
      setStatusMessage({ type: 'success', text: `Estado del usuario actualizado.` })
      refetchUsers()
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Fallo al actualizar estado.' })
    }
  }

  // ── Tab navigation groups ────────────────────────────────────────────────
  const navItems: NavItem[] = [
    { id: 'general', icon: SlidersHorizontal, label: 'Generales' },
    { id: 'company', icon: Building, label: 'Datos de la Empresa' },
    { id: 'gateway', icon: Router, label: 'Gateway' },
    { id: 'billing', icon: Receipt, label: 'Facturación' },
    { id: 'users', icon: Users, label: 'Operadores' },
    { id: 'alerts', icon: Bell, label: 'Alertas' },
    { id: 'logs', icon: ClipboardList, label: 'Logs' },
  ]

  const activeLabel = navItems.find(i => i.id === activeTab)?.label ?? ''

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Ajustes del ISP</h1>
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-56 flex-shrink-0 sticky top-6">
          <nav className="glass-card p-2 space-y-1">
            {navItems.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => { setActiveTab(id); setStatusMessage(null); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer text-left ${activeTab === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Right Content Panel ───────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Breadcrumb / Section title */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Ajustes</span>
            <span>/</span>
            <span className="text-foreground font-medium">{activeLabel}</span>
          </div>


          {/* Status Alert */}
          {statusMessage && (
            <div
              className={`rounded-xl p-4 flex items-start gap-3 border ${statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <p className="text-sm font-medium">{statusMessage.text}</p>
            </div>
          )}
          {/* ── Tab Content: Ajustes Generales / Ajustes de Sistema ─────────────────── */}
          {activeTab === 'general' && (
            <GeneralSettingsTab isAdmin={isAdmin} setStatusMessage={setStatusMessage} />
          )}

          {/* ── Tab Content: Company ──────────────────────────────────────────────── */}
          {activeTab === 'company' && (
            <div className="glass-card p-6">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <Building className="w-4 h-4 text-brand-400" />
                Información Corporativa de la Empresa
              </h2>

              {loadingCompany ? (
                <div className="flex items-center justify-center h-48">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Cargando datos de la empresa...</span>
                  </div>
                </div>
              ) : (
                <form
                  id="company-form"
                  onSubmit={handleSubmitCompany((data) => companyMutation.mutate(data))}
                  onChange={() => setIsCompanyDirty(true)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Razón Social */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Razón Social (Nombre) *</label>
                      <div className="relative">
                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="company-nombre"
                          type="text"
                          {...registerCompany('nombre')}
                          className="input-field pl-10"
                          placeholder="Mi WISP S.A."
                        />
                      </div>
                      {companyErrors.nombre && (
                        <p className="text-xs text-destructive mt-1">{companyErrors.nombre.message}</p>
                      )}
                    </div>

                    {/* RUC */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">RUC (Registro Único de Contribuyentes)</label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="company-ruc"
                          type="text"
                          {...registerCompany('ruc')}
                          className="input-field pl-10 font-mono"
                          placeholder="1790000000001"
                        />
                      </div>
                      {companyErrors.ruc && (
                        <p className="text-xs text-destructive mt-1">{companyErrors.ruc.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Teléfono */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Teléfono de Contacto</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="company-telefono"
                          type="text"
                          {...registerCompany('telefono')}
                          className="input-field pl-10"
                          placeholder="+593 2-123-4567 o +593 99 999 9999"
                        />
                      </div>
                      {companyErrors.telefono && (
                        <p className="text-xs text-destructive mt-1">{companyErrors.telefono.message}</p>
                      )}
                    </div>

                    {/* Correo */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Correo de Facturación/Contacto</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="company-email"
                          type="email"
                          {...registerCompany('email')}
                          className="input-field pl-10"
                          placeholder="facturacion@miwisp.com"
                        />
                      </div>
                      {companyErrors.email && (
                        <p className="text-xs text-destructive mt-1">{companyErrors.email.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Dirección */}
                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-1.5">Dirección Principal</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="company-direccion"
                          type="text"
                          {...registerCompany('direccion')}
                          className="input-field pl-10"
                          placeholder="Av. Principal N34-12 y Calle Secundaria, Quito, Ecuador"
                        />
                      </div>
                      {companyErrors.direccion && (
                        <p className="text-xs text-destructive mt-1">{companyErrors.direccion.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Sitio Web */}
                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-1.5">Sitio Web</label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="company-sitio-web"
                          type="text"
                          {...registerCompany('sitio_web')}
                          className="input-field pl-10 font-mono"
                          placeholder="https://www.miwisp.com"
                        />
                      </div>
                      {companyErrors.sitio_web && (
                        <p className="text-xs text-destructive mt-1">{companyErrors.sitio_web.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Logo Section */}
                  <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-background/30 border border-border/50 backdrop-blur-md space-y-4">
                    <label className="block text-sm font-medium text-foreground">
                      Logotipo de la Empresa
                    </label>
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {/* Preview Area */}
                      <div className="relative group w-24 h-24 rounded-full overflow-hidden border-2 border-primary/30 flex items-center justify-center bg-background/50 flex-shrink-0 shadow-lg">
                        {watchLogoUrl ? (
                          <img
                            src={getLogoUrl(watchLogoUrl)}
                            alt="Logo de la empresa"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <Building className="w-8 h-8 text-muted-foreground" />
                        )}

                        {uploadingLogo && (
                          <div className="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        )}
                      </div>

                      {/* Actions & Information */}
                      <div className="flex-1 text-center sm:text-left space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Suba un archivo de imagen en formato PNG, JPG, JPEG, WEBP o SVG. Se recomienda una imagen cuadrada.
                        </p>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                          <label
                            htmlFor="logo-file-input"
                            className={`btn-primary flex items-center gap-2 cursor-pointer text-xs py-2 px-4 select-none ${uploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            <Upload className="w-4 h-4" />
                            Subir Imagen Logo
                          </label>
                          <input
                            id="logo-file-input"
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                            className="hidden"
                            onChange={handleLogoUpload}
                            disabled={uploadingLogo}
                          />

                          <button
                            type="button"
                            onClick={() => setShowManualUrl(!showManualUrl)}
                            className="text-xs text-muted-foreground hover:text-primary transition-colors py-2 px-3 border border-border/50 rounded-lg bg-background/20 hover:bg-background/40"
                          >
                            {showManualUrl ? 'Ocultar URL manual' : 'Configurar URL manualmente'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Manual URL input */}
                    {showManualUrl && (
                      <div className="pt-3 border-t border-border/30 animate-fade-in">
                        <label htmlFor="company-logo-url" className="block text-xs font-medium text-muted-foreground mb-1.5">
                          Dirección URL externa del Logo
                        </label>
                        <div className="relative">
                          <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            id="company-logo-url"
                            type="text"
                            {...registerCompany('logo_url')}
                            className="input-field pl-10 font-mono text-sm"
                            placeholder="https://www.miwisp.com/logo.png"
                          />
                        </div>
                        {companyErrors.logo_url && (
                          <p className="text-xs text-destructive mt-1">{companyErrors.logo_url.message}</p>
                        )}
                      </div>
                    )}

                    {/* Toggle: usar logo en login */}
                    <label className="flex items-center gap-4 py-3 px-4 rounded-xl bg-secondary/20 border border-border/50 cursor-pointer select-none">
                      <div className="relative flex-shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={watchCompany('use_logo_on_login') ?? false}
                          onChange={e => setValueCompany('use_logo_on_login', e.target.checked)}
                        />
                        <div className="w-11 h-6 rounded-full bg-muted transition-colors peer-checked:bg-brand-500" />
                        <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Usar logotipo en inicio de sesión</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Muestra el logo de la empresa en la pantalla de login</p>
                      </div>
                    </label>
                  </div>

                  {/* Login Background Section */}
                  <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-background/30 border border-border/50 backdrop-blur-md space-y-4">
                    <label className="block text-sm font-medium text-foreground">
                      Fondo de inicio de sesión
                    </label>

                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {/* Preview */}
                      <div className="relative w-32 h-20 rounded-lg overflow-hidden border-2 border-border/50 flex items-center justify-center bg-background/50 flex-shrink-0 shadow">
                        {watchLoginBgUrl ? (
                          <img
                            src={getLogoUrl(watchLoginBgUrl)}
                            alt="Fondo login"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-brand-900/80 via-surface-50 to-surface-200 flex items-center justify-center">
                            <p className="text-xs text-muted-foreground text-center px-2">Fondo<br />predeterminado</p>
                          </div>
                        )}
                        {uploadingLoginBg && (
                          <div className="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex-1 text-center sm:text-left space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Suba una imagen para el fondo del panel de bienvenida (PNG, JPG, JPEG, WEBP). Se recomienda una imagen de alta resolución.
                        </p>
                        <label
                          htmlFor="login-bg-file-input"
                          className={`btn-primary inline-flex items-center gap-2 cursor-pointer text-xs py-2 px-4 select-none ${uploadingLoginBg ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <Upload className="w-4 h-4" />
                          Subir Imagen de Fondo
                        </label>
                        <input
                          id="login-bg-file-input"
                          type="file"
                          accept="image/png, image/jpeg, image/jpg, image/webp"
                          className="hidden"
                          onChange={handleLoginBgUpload}
                          disabled={uploadingLoginBg}
                        />
                        {watchLoginBgUrl && (
                          <button
                            type="button"
                            onClick={() => { setValueCompany('login_bg_url', ''); setIsCompanyDirty(true) }}
                            className="ml-2 text-xs text-destructive hover:text-destructive/80 transition-colors py-2 px-3 border border-destructive/30 rounded-lg bg-background/20 hover:bg-background/40"
                          >
                            Quitar fondo
                          </button>
                        )}
                      </div>
                    </div>
                    <label className="flex items-center gap-4 py-3 px-4 rounded-xl bg-secondary/20 border border-border/50 cursor-pointer select-none">
                      <div className="relative flex-shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={watchCompany('use_login_bg') ?? false}
                          onChange={e => setValueCompany('use_login_bg', e.target.checked)}
                        />
                        <div className="w-11 h-6 rounded-full bg-muted transition-colors peer-checked:bg-brand-500" />
                        <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Usar fondo en inicio de sesión</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Imagen personalizada para el panel izquierdo del login</p>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="submit"
                      id="save-company-btn"
                      disabled={companyMutation.isPending}
                      className={isCompanyDirty || companyMutation.isPending ? 'btn-primary' : 'btn-secondary'}
                    >
                      {companyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {companyMutation.isPending ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ── Tab Content: Gateway ────────────────────────────────────────────────── */}
          {activeTab === 'gateway' && (
            <div className="space-y-4">

              {/* ── Sección: MikroTik API ──────────────────────────────────────── */}
              <div className="glass-card p-6 space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5 text-brand-400" />
                    MikroTik API
                  </h3>
                  <p className="text-muted-foreground text-xs mt-1">
                    Parámetros globales de conexión a la API de MikroTik aplicados a todos los gateways.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Attempts */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Attempts
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={mikrotikAttempts}
                      onChange={(e) => setMikrotikAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                      className="input-field font-mono max-w-[160px]"
                    />
                    <p className="text-[11px] text-muted-foreground">Intentos de reconexión antes de marcar el gateway como offline.</p>
                  </div>

                  {/* Timeout */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Timeout (seg)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={mikrotikTimeout}
                      onChange={(e) => setMikrotikTimeout(Math.max(1, parseInt(e.target.value) || 1))}
                      className="input-field font-mono max-w-[160px]"
                    />
                    <p className="text-[11px] text-muted-foreground">Segundos de espera máxima por respuesta de la API.</p>
                  </div>

                  {/* Debug */}
                  <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-secondary/20 border border-border/50">
                    <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                      <input type="checkbox" checked={mikrotikDebug} onChange={(e) => setMikrotikDebug(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                    </label>
                    <div>
                      <span className="text-sm font-medium text-foreground block">Debug / Logs RouterOS</span>
                      <span className="text-xs text-muted-foreground">Registra el tráfico detallado de la API.</span>
                    </div>
                  </div>

                  {/* SSL */}
                  <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-secondary/20 border border-border/50">
                    <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                      <input type="checkbox" checked={mikrotikSsl} onChange={(e) => setMikrotikSsl(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                    </label>
                    <div>
                      <span className="text-sm font-medium text-foreground block">SSL</span>
                      <span className="text-xs text-muted-foreground">Usar conexión cifrada TLS/SSL con la API de MikroTik.</span>
                    </div>
                  </div>
                </div>

                {/* Nota dinámica: tiempo máximo para marcar offline */}
                {(() => {
                  const worstCase = mikrotikAttempts * mikrotikTimeout + Math.max(0, mikrotikAttempts - 1)
                  const waitBetween = Math.max(0, mikrotikAttempts - 1)
                  return (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 leading-relaxed">
                      <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <span>
                        Con los valores actuales, un gateway sin respuesta tardará hasta{' '}
                        <strong className="text-amber-200">{worstCase} seg</strong> en ser marcado como{' '}
                        <span className="font-semibold">offline</span>
                        {' '}({mikrotikAttempts} intento{mikrotikAttempts !== 1 ? 's' : ''} × {mikrotikTimeout}s
                        {waitBetween > 0 ? ` + ${waitBetween}s de espera entre intentos` : ''}).
                        {worstCase > 60 && (
                          <span className="block mt-1 text-amber-400/80">
                            ⚠ Esto supera el intervalo del health check (60s) — algunos ciclos podrían saltarse gateways lentos.
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })()}

                <div className="flex justify-end pt-2 border-t border-border/50">
                  <button
                    type="button"
                    onClick={handleSaveMikrotikApi}
                    disabled={mikrotikApiMutation.isPending}
                    className={`${mikrotikDirty || mikrotikApiMutation.isPending ? 'btn-primary' : 'btn-secondary'} px-5 disabled:opacity-50`}
                  >
                    {mikrotikApiMutation.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Save className="w-4 h-4" />}
                    {mikrotikApiMutation.isPending ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
              
              {/* ── Sección: Sitios ───────────────────────────────────────────── */}
              <div className="glass-card p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-brand-400" />
                      Sitios
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1">
                      Sitios disponibles para gateways y zona de clientes. Cada sitio puede tener coordenadas GPS.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSiteModalSite(null); setSiteModalOpen(true) }}
                    className="btn-primary shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar sitio
                  </button>
                </div>

                {/* Tabla de sitios */}
                {loadingSites ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando sitios...
                  </div>
                ) : sitesList.length > 0 ? (
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-background/20">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/40 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          <th className="px-4 py-3">Nombre</th>
                          <th className="px-4 py-3">Latitud</th>
                          <th className="px-4 py-3">Longitud</th>
                          <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 text-sm">
                        {sitesList.map((site) => (
                          <tr key={site.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-semibold text-foreground">{site.nombre}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-muted-foreground text-xs">
                                {site.latitud != null ? site.latitud.toFixed(6) : <span className="opacity-40">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-muted-foreground text-xs">
                                {site.longitud != null ? site.longitud.toFixed(6) : <span className="opacity-40">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => { setSiteModalSite(site); setSiteModalOpen(true) }}
                                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSite({ id: site.id, nombre: site.nombre })}
                                  className="p-1 text-destructive hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border/40 rounded-xl">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No hay sitios creados</p>
                    <p className="text-xs mt-1">Haz clic en "Agregar sitio" para comenzar.</p>
                  </div>
                )}
              </div>

              {/* ── Sección: Colas Padre ───────────────────────────────────────── */}
              <div className="glass-card p-6 space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Router className="w-5 h-5 text-brand-400" />
                    Nombres de Cola Padre
                  </h3>
                  <p className="text-muted-foreground text-xs mt-1">
                    Gestiona los nombres de colas padre disponibles para seleccionar al registrar o editar un router.
                  </p>
                </div>

                {/* Formulario de agregar */}
                <form onSubmit={handleAddColaPadre} className="flex gap-3 max-w-md items-end">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Nueva Cola Padre
                    </label>
                    <input
                      type="text"
                      value={newColaPadre}
                      onChange={(e) => setNewColaPadre(e.target.value)}
                      className="input-field font-mono"
                      placeholder="isp_padre_global"
                    />
                  </div>
                  <button type="submit" className="btn-primary select-none h-11 px-4">
                    <Plus className="w-4 h-4" />
                    Agregar
                  </button>
                </form>

                {/* Tabla de colas padre */}
                {colasPadre.length > 0 ? (
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-background/20">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/40 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          <th className="px-4 py-3">Nombre de la Cola Padre</th>
                          <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 text-sm">
                        {colasPadre.map((c) => (
                          <tr key={c} className="hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3">
                              {editingColaPadre === c ? (
                                <input
                                  type="text"
                                  value={editingColaPadreVal}
                                  onChange={(e) => setEditingColaPadreVal(e.target.value)}
                                  className="input-field py-1 px-2 text-sm max-w-[280px] font-mono"
                                />
                              ) : (
                                <span className="font-mono font-semibold text-foreground">{c}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                {editingColaPadre === c ? (
                                  <>
                                    <button type="button" onClick={() => handleSaveColaPadre(c)}
                                      className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-all cursor-pointer" title="Guardar">
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => setEditingColaPadre(null)}
                                      className="p-1 text-muted-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer" title="Cancelar">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => { setEditingColaPadre(c); setEditingColaPadreVal(c) }}
                                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer" title="Editar">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => handleDeleteColaPadre(c)}
                                      className="p-1 text-destructive hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer" title="Eliminar">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border/40 rounded-xl">
                    <Router className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    <p>No hay colas padre configuradas. Agrega una arriba.</p>
                  </div>
                )}
              </div>

              {/* ── Sección: Address Lists ─────────────────────────────────────── */}
              <div className="glass-card p-6 space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Hash className="w-5 h-5 text-brand-400" />
                    Nombres de Address List de Clientes
                  </h3>
                  <p className="text-muted-foreground text-xs mt-1">
                    Gestiona los nombres de Address Lists disponibles para seleccionar al registrar o editar un router.
                  </p>
                </div>

                {/* Formulario de agregar */}
                <form onSubmit={handleAddAddressList} className="flex gap-3 max-w-md items-end">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Nueva Address List
                    </label>
                    <input
                      type="text"
                      value={newAddressList}
                      onChange={(e) => setNewAddressList(e.target.value)}
                      className="input-field font-mono"
                      placeholder="isp_clientes_norte"
                    />
                  </div>
                  <button type="submit" className="btn-primary select-none h-11 px-4">
                    <Plus className="w-4 h-4" />
                    Agregar
                  </button>
                </form>

                {/* Tabla de address lists */}
                {addressLists.length > 0 ? (
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-background/20">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/40 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          <th className="px-4 py-3">Nombre de la Address List</th>
                          <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 text-sm">
                        {addressLists.map((a) => (
                          <tr key={a} className="hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3">
                              {editingAddressList === a ? (
                                <input
                                  type="text"
                                  value={editingAddressListVal}
                                  onChange={(e) => setEditingAddressListVal(e.target.value)}
                                  className="input-field py-1 px-2 text-sm max-w-[280px] font-mono"
                                />
                              ) : (
                                <span className="font-mono font-semibold text-foreground">{a}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                {editingAddressList === a ? (
                                  <>
                                    <button type="button" onClick={() => handleSaveAddressList(a)}
                                      className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-all cursor-pointer" title="Guardar">
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => setEditingAddressList(null)}
                                      className="p-1 text-muted-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer" title="Cancelar">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => { setEditingAddressList(a); setEditingAddressListVal(a) }}
                                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer" title="Editar">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => handleDeleteAddressList(a)}
                                      className="p-1 text-destructive hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer" title="Eliminar">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border/40 rounded-xl">
                    <Hash className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    <p>No hay Address Lists configuradas. Agrega una arriba.</p>
                  </div>
                )}
              </div>

            </div>

          )}

          {/* ── Tab Content: Facturación ─────────────────────────────────────────── */}
          {activeTab === 'billing' && (
            <div className="space-y-6 animate-fade-in">
              {/* Horizontal Sub-tabs */}
              <div className="flex flex-wrap gap-1 p-1 bg-secondary/30 rounded-xl border border-secondary/50 max-w-max">
                {[
                  { id: 'billing', label: 'Ajustes' },
                  { id: 'suspension', label: 'Suspensión' },
                  { id: 'payment_methods', label: 'Método de Pago' },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => { setGeneralSubTab(sub.id as any); setStatusMessage(null); }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${generalSubTab === sub.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              {generalSubTab === 'billing' && (
                <div className="glass-card p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-brand-400" />
                      Configuración de Facturación
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1">
                      Administra las políticas de facturación automática, ciclos de cobro y notificaciones de pago a tus suscriptores.
                    </p>
                  </div>

                  <form
                    key={billingData ? 'loaded' : 'loading'}
                    onSubmit={(e) => {
                      e.preventDefault()
                      const target = e.currentTarget as any
                      billingMutation.mutate({
                        billing_hora_generacion: target.horaGeneracion.value,
                        billing_ciclo: target.cicloFacturacion.value,
                        billing_modo_precio: target.modoPrecio.value,
                        billing_auto_aprobar_enviar: target.autoAprobarEnviar.checked,
                        billing_detener_suspendidos: target.detenerSuspendidos.checked,
                        billing_notify_new_invoice: target.notifyNewInvoice.checked,
                        billing_attach_pdf_receipt: target.attachPdfReceipt.checked,
                        billing_default_dia_pago: parseInt(target.defaultDiaPago.value, 10),
                        billing_default_dias_gracia: parseInt(target.defaultDiasGracia.value, 10),
                        billing_aviso_nueva_factura: target.avisoNuevaFactura.checked,
                        billing_aviso_previo_dias: parseInt(target.avisoPrevioDias.value, 10),
                        billing_recordatorios_pago: target.recordatoriosPago.checked,
                        billing_recordatorio_frecuencia_dias: parseInt(target.recordatorioFrecuenciaDias.value, 10),
                      })
                    }}
                    onChange={() => setBillingDirty(true)}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Hora de generación de facturas
                        </label>
                        <input
                          name="horaGeneracion"
                          type="time"
                          defaultValue={billingData?.billing_hora_generacion || '08:00'}
                          className="input-field font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Ciclo de facturación por defecto
                        </label>
                        <select
                          name="cicloFacturacion"
                          defaultValue={billingData?.billing_ciclo || 'mensual'}
                          className="input-field"
                        >
                          <option value="mensual">Mensual</option>
                          <option value="bimestral">Bimestral</option>
                          <option value="trimestral">Trimestral</option>
                          <option value="semestral">Semestral</option>
                          <option value="anual">Anual</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Modo de precio
                        </label>
                        <select
                          name="modoPrecio"
                          defaultValue={billingData?.billing_modo_precio || 'incluido'}
                          className="input-field"
                        >
                          <option value="incluido">Precios incluyendo impuestos</option>
                          <option value="excluido">Precios excluyendo impuestos</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Día de pago mensual predeterminado
                        </label>
                        <input
                          name="defaultDiaPago"
                          type="number"
                          min="1"
                          max="28"
                          defaultValue={String(billingData?.billing_default_dia_pago ?? 5)}
                          className="input-field font-mono"
                          placeholder="5"
                        />
                        <span className="text-[10px] text-muted-foreground block">
                          Día del mes establecido por defecto para los cobros a nuevos clientes.
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Días de gracia
                        </label>
                        <input
                          name="defaultDiasGracia"
                          type="number"
                          min="0"
                          defaultValue={String(billingData?.billing_default_dias_gracia ?? 3)}
                          className="input-field font-mono"
                          placeholder="3"
                        />
                        <span className="text-[10px] text-muted-foreground block">
                          Días adicionales concedidos para realizar el pago antes de recargos o suspensión del servicio.
                        </span>
                      </div>
                    </div>

                    <hr className="border-border/50" />

                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Políticas de Automatización
                      </h4>

                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
                          <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                            <input name="autoAprobarEnviar" type="checkbox" defaultChecked={billingData?.billing_auto_aprobar_enviar ?? true} className="sr-only peer" />
                            <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                          </label>
                          <div>
                            <span className="text-sm font-medium text-foreground block">
                              Aprobar y enviar facturas automáticamente
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Los borradores de facturas se aprueban y se envían automáticamente al cliente inmediatamente después de ser generados.
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                            <input name="detenerSuspendidos" type="checkbox" defaultChecked={billingData?.billing_detener_suspendidos ?? true} className="sr-only peer" />
                            <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                          </label>
                          <div>
                            <span className="text-sm font-medium text-foreground block">
                              Detener la facturación de servicios suspendidos
                            </span>
                            <span className="text-xs text-muted-foreground">
                              No se facturarán los períodos de facturación que estén cubiertos en su totalidad por una suspensión del servicio.
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <hr className="border-border/50" />

                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Notificaciones y Avisos a Clientes
                      </h4>

                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                            <input name="notifyNewInvoice" type="checkbox" defaultChecked={billingData?.billing_notify_new_invoice ?? true} className="sr-only peer" />
                            <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                          </label>
                          <div>
                            <span className="text-sm font-medium text-foreground block">
                              Notificar Factura nueva
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Enviar automáticamente un correo electrónico de notificación al cliente cuando se genera una nueva factura.
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                            <input name="attachPdfReceipt" type="checkbox" defaultChecked={billingData?.billing_attach_pdf_receipt ?? true} className="sr-only peer" />
                            <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                          </label>
                          <div>
                            <span className="text-sm font-medium text-foreground block">
                              Adjuntar el recibo como archivo PDF
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Adjuntar el archivo PDF de la factura/recibo de pago en el correo de notificación saliente.
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-7">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                                <input name="avisoNuevaFactura" type="checkbox" defaultChecked={billingData?.billing_aviso_nueva_factura ?? true} className="sr-only peer" />
                                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                              </label>
                              <div>
                                <span className="text-xs font-semibold text-foreground block">Aviso de nueva factura</span>
                                <span className="text-[10px] text-muted-foreground">Enviar un aviso previo al cliente.</span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-muted-foreground block uppercase">Días de aviso previo</label>
                              <input
                                name="avisoPrevioDias"
                                type="number"
                                min="1"
                                defaultValue={String(billingData?.billing_aviso_previo_dias ?? 5)}
                                className="input-field py-1 px-2 text-xs font-mono w-24"
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                                <input name="recordatoriosPago" type="checkbox" defaultChecked={billingData?.billing_recordatorios_pago ?? true} className="sr-only peer" />
                                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                              </label>
                              <div>
                                <span className="text-xs font-semibold text-foreground block">Recordatorios de pago</span>
                                <span className="text-[10px] text-muted-foreground">Enviar recordatorios automáticos de facturas pendientes.</span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-muted-foreground block uppercase">Enviar recordatorio cada (días)</label>
                              <input
                                name="recordatorioFrecuenciaDias"
                                type="number"
                                min="1"
                                defaultValue={String(billingData?.billing_recordatorio_frecuencia_dias ?? 3)}
                                className="input-field py-1 px-2 text-xs font-mono w-24"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-border/50">
                      <button type="submit" className={billingDirty ? 'btn-primary' : 'btn-secondary'}>
                        <Save className="w-4 h-4" />
                        Guardar
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {generalSubTab === 'suspension' && (
                <div className="space-y-5">
                  {/* Header */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Ban className="w-5 h-5 text-brand-400" />
                      Políticas de Suspensión de Servicio
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1">
                      Configura los motivos disponibles para suspensiones manuales y define las reglas de suspensión automática por falta de pago.
                    </p>
                  </div>

                  {/* Tarjeta: Motivos */}
                  <div className="glass-card p-5 border border-border/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider">
                        <ClipboardList className="w-4 h-4" /> Motivos de Suspensión Manual
                      </div>
                      <span className="text-[10px] text-muted-foreground bg-secondary/40 px-2 py-0.5 rounded-full border border-border/40">
                        {suspensionMotivos.length} configurados
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Razones que aparecerán como opciones en el modal al suspender manualmente un servicio.
                    </p>

                    {suspensionMotivos.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic p-3 text-center border border-dashed border-border/50 rounded-lg">
                        No hay motivos configurados. Agrega al menos uno.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {suspensionMotivos.map((motivo) => (
                          <div key={motivo} className="group flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg bg-secondary/40 border border-border/60 text-sm text-foreground hover:border-destructive/40 transition-colors">
                            <span>{motivo}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteMotivo(motivo)}
                              className="text-muted-foreground hover:text-destructive transition-colors opacity-40 group-hover:opacity-100"
                              title="Eliminar motivo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleAddMotivo} className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={newMotivo}
                        onChange={(e) => setNewMotivo(e.target.value)}
                        placeholder="Agregar nuevo motivo..."
                        className="input-field flex-1 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={!newMotivo.trim()}
                        className="btn-primary px-3 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </form>
                  </div>

                  {/* Grid: Temporización + Notificaciones */}
                  <form
                    key={suspensionData ? 'loaded' : 'loading'}
                    onSubmit={(e) => {
                      e.preventDefault()
                      const target = e.currentTarget as any
                      suspensionMutation.mutate({
                        suspension_automatica: target.suspensionAutomatica.checked,
                        suspension_hora: parseInt(target.horaSuspension.value, 10),
                        suspension_retraso_dias: parseInt(target.retrasoDias.value, 10),
                        suspension_permitir_aplazamiento: target.permitirAplazamiento.checked,
                        suspension_notify_suspendido: target.notifySuspendido.checked,
                        suspension_notify_pospuesto: target.notifyPospuesto.checked,
                      })
                      setSuspensionDirty(false)
                      setStatusMessage({ type: 'success', text: 'Políticas de suspensión actualizadas correctamente.' })
                    }}
                    onChange={() => setSuspensionDirty(true)}
                    className="space-y-5"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                      {/* Tarjeta: Temporización y Automatización */}
                      <div className="glass-card p-5 border border-border/60 space-y-5">
                        <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider">
                          <Clock className="w-4 h-4" /> Temporización y Automatización
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                              Hora de corte (24h)
                            </label>
                            <input
                              name="horaSuspension"
                              type="number"
                              min="0"
                              max="23"
                              defaultValue={String(suspensionData?.suspension_hora ?? 0)}
                              className="input-field font-mono"
                              placeholder="0"
                            />
                            <span className="text-[11px] text-muted-foreground block">
                              Hora en la que se ejecutará la suspensión.
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                              Días de gracia
                            </label>
                            <input
                              name="retrasoDias"
                              type="number"
                              min="0"
                              defaultValue={String(suspensionData?.suspension_retraso_dias ?? 0)}
                              className="input-field font-mono"
                              placeholder="0"
                            />
                            <span className="text-[11px] text-muted-foreground block">
                              Días extra tras el vencimiento antes de suspender.
                            </span>
                          </div>
                        </div>

                        <div className="space-y-3 pt-2 border-t border-border/40">
                          <div className="flex items-start gap-3">
                            <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0 mt-0.5">
                              <input name="suspensionAutomatica" type="checkbox" defaultChecked={suspensionData?.suspension_automatica ?? true} className="sr-only peer" />
                              <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                            </label>
                            <div>
                              <span className="text-sm font-medium text-foreground block">Suspensión automática por vencimiento</span>
                              <span className="text-xs text-muted-foreground">Suspende servicios con facturas vencidas de forma automática (se puede anular por cliente).</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0 mt-0.5">
                              <input name="permitirAplazamiento" type="checkbox" defaultChecked={suspensionData?.suspension_permitir_aplazamiento ?? true} className="sr-only peer" />
                              <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                            </label>
                            <div>
                              <span className="text-sm font-medium text-foreground block">Permitir aplazamiento</span>
                              <span className="text-xs text-muted-foreground">Muestra la opción de aplazar la suspensión hasta una fecha específica al gestionar un cliente.</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tarjeta: Notificaciones */}
                      <div className="glass-card p-5 border border-border/60 space-y-5">
                        <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider">
                          <Bell className="w-4 h-4" /> Notificaciones de Suspensión
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Configura cuándo enviar notificaciones automáticas por correo electrónico al cliente.
                        </p>

                        <div className="space-y-3">
                          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20 border border-border/40">
                            <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0 mt-0.5">
                              <input name="notifySuspendido" type="checkbox" defaultChecked={suspensionData?.suspension_notify_suspendido ?? true} className="sr-only peer" />
                              <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                            </label>
                            <div>
                              <span className="text-sm font-medium text-foreground block">Al suspender el servicio</span>
                              <span className="text-xs text-muted-foreground">Notifica al cliente cuando su servicio ha sido suspendido.</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20 border border-border/40">
                            <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0 mt-0.5">
                              <input name="notifyPospuesto" type="checkbox" defaultChecked={suspensionData?.suspension_notify_pospuesto ?? true} className="sr-only peer" />
                              <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                            </label>
                            <div>
                              <span className="text-sm font-medium text-foreground block">Al posponer la suspensión</span>
                              <span className="text-xs text-muted-foreground">Notifica al cliente cuando la suspensión ha sido aplazada manualmente desde el panel.</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button type="submit" className={suspensionDirty ? 'btn-primary' : 'btn-secondary'}>
                        <Save className="w-4 h-4" />
                        Guardar Políticas
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {generalSubTab === 'payment_methods' && (
                <div className="glass-card p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-brand-400" />
                      Gestión de Métodos de Pago
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1">
                      Agrega, edita y administra los métodos de pago aceptados para registrar los cobros manuales y facturación de tus clientes.
                    </p>
                  </div>

                  <form onSubmit={handleAddPaymentMethod} className="flex gap-3 max-w-md items-end">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                        Nuevo Método de Pago
                      </label>
                      <input
                        type="text"
                        value={newMethodLabel}
                        onChange={(e) => setNewMethodLabel(e.target.value)}
                        className="input-field"
                        placeholder="Ej: PayPal, Binance, Western Union"
                      />
                    </div>
                    <button type="submit" className="btn-primary select-none h-11 px-4">
                      <Plus className="w-4 h-4" />
                      Agregar
                    </button>
                  </form>

                  <div className="border border-border/60 rounded-xl overflow-hidden bg-background/20">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/40 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          <th className="px-4 py-3">Nombre visible (Label)</th>
                          <th className="px-4 py-3">Código interno (Value)</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 text-sm">
                        {paymentMethods.map((m) => (
                          <tr key={m.value} className="hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3">
                              {editingValue === m.value ? (
                                <input
                                  type="text"
                                  value={editingLabel}
                                  onChange={(e) => setEditingLabel(e.target.value)}
                                  className="input-field py-1 px-2 text-sm max-w-[220px] font-sans"
                                />
                              ) : (
                                <span className="font-semibold text-foreground">{m.label}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.value}</td>
                            <td className="px-4 py-3">
                              {m.isSystem ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                  Sistema
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
                                  Personalizado
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                {editingValue === m.value ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(m.value)}
                                      className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                                      title="Guardar"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingValue(null)}
                                      className="p-1 text-muted-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer"
                                      title="Cancelar"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingValue(m.value)
                                        setEditingLabel(m.label)
                                      }}
                                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer"
                                      title="Editar nombre"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    {!m.isSystem && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeletePaymentMethod(m.value)}
                                        className="p-1 text-destructive hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                                        title="Eliminar método de pago"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <hr className="border-border/50" />

                  {/* Fechas de Corte */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Hash className="w-5 h-5 text-brand-400" />
                        Fechas de Corte Disponibles
                      </h3>
                      <span className="text-[10px] text-muted-foreground bg-secondary/40 px-2 py-0.5 rounded-full border border-border/40">
                        {fechasCorte.length} fechas
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs mb-5">
                      Define los días del mes disponibles como "Fecha de corte" al registrar o editar un cliente. Los días se ordenan automáticamente.
                    </p>

                    <form onSubmit={handleAddFechaCorte} className="flex gap-3 max-w-md items-end mb-5">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Nuevo día (1 – 31)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={newFechaCorteInput}
                          onChange={(e) => setNewFechaCorteInput(e.target.value)}
                          className="input-field font-mono"
                          placeholder="Ej: 20"
                        />
                      </div>
                      <button type="submit" className="btn-primary select-none h-11 px-4">
                        <Plus className="w-4 h-4" />
                        Agregar
                      </button>
                    </form>

                    <div className="border border-border/60 rounded-xl overflow-hidden bg-background/20">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-secondary/40 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="px-4 py-3">Día del mes</th>
                            <th className="px-4 py-3">Etiqueta visible</th>
                            <th className="px-4 py-3 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 text-sm">
                          {fechasCorte.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground italic">
                                No hay fechas de corte configuradas.
                              </td>
                            </tr>
                          ) : (
                            fechasCorte.map((dia) => (
                              <tr key={dia} className="hover:bg-secondary/20 transition-colors">
                                <td className="px-4 py-3">
                                  {editingFechaCorteDay === dia ? (
                                    <input
                                      type="number"
                                      min="1"
                                      max="31"
                                      value={editingFechaCorteVal}
                                      onChange={(e) => setEditingFechaCorteVal(e.target.value)}
                                      className="input-field py-1 px-2 text-sm font-mono w-24"
                                      autoFocus
                                    />
                                  ) : (
                                    <span className="font-mono font-bold text-foreground">{String(dia).padStart(2, '0')}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  Día {dia} de cada mes
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-2">
                                    {editingFechaCorteDay === dia ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveFechaCorte(dia)}
                                          className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                                          title="Guardar"
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingFechaCorteDay(null)}
                                          className="p-1 text-muted-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer"
                                          title="Cancelar"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => { setEditingFechaCorteDay(dia); setEditingFechaCorteVal(String(dia)) }}
                                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer"
                                          title="Editar"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteFechaCorte(dia)}
                                          className="p-1 text-destructive hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                                          title="Eliminar"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Users ────────────────────────────────────────────────────── */}
          {activeTab === 'users' && (
            <div className="glass-card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-400" />
                    Gestión de Operadores y Usuarios
                  </h3>
                  <p className="text-muted-foreground text-xs mt-1">
                    Registra tus técnicos, instaladores, administradores y personal de cobranzas, asignando permisos y horarios de acceso.
                  </p>
                </div>
                <button
                  onClick={handleOpenCreateUser}
                  className="btn-primary select-none text-xs py-2 px-3"
                >
                  <UserPlus className="w-4 h-4" />
                  Nuevo Operador
                </button>
              </div>

              {loadingUsers ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="border border-border/60 rounded-xl overflow-hidden bg-background/20">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/40 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Tipo de Operador</th>
                        <th className="px-4 py-3">Horario</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-sm">
                      {usersList.map((u) => (
                        <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">{u.nombre}</td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{u.email}</td>
                          <td className="px-4 py-3 capitalize">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
                              {(u.tipo_operador || u.rol).replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                            {u.horario_acceso || 'Libre'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleToggleUserStatus(u)}
                              className="flex items-center gap-1.5 focus:outline-none cursor-pointer"
                              title="Hacer clic para activar/desactivar"
                            >
                              {u.activo ? (
                                <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                                  <ToggleRight className="w-5 h-5 text-emerald-400" /> Activo
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-muted-foreground text-xs font-semibold">
                                  <ToggleLeft className="w-5 h-5 text-muted-foreground" /> Inactivo
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleOpenEditUser(u)}
                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer"
                                title="Editar Operador"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {u.id !== currentUser?.id && (
                                <button
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="p-1.5 text-destructive hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                                  title="Eliminar Operador"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tab Content: Alertas ──────────────────────────────────────────────── */}
          {activeTab === 'alerts' && (
            <div className="glass-card p-12 text-center max-w-xl mx-auto space-y-4 animate-fade-in">
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto border border-amber-500/25 animate-pulse">
                <Bell className="w-8 h-8 text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Centro de Alertas</h3>
              <p className="text-muted-foreground text-sm">
                Panel consolidado de notificaciones de estado de enrutadores, latencia alta, y eventos del sistema. Próximamente (Fase 3).
              </p>
            </div>
          )}

          {/* ── Tab Content: Log del Sistema ─────────────────────────────────────── */}
          {activeTab === 'logs' && (
            <div className="space-y-4 animate-fade-in">
              {/* Filtros */}
              <div className="glass-card p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-400 uppercase tracking-wider">
                  <ClipboardList className="w-3.5 h-3.5" />
                  Filtros
                </div>
                <select
                  value={logFilterAccion}
                  onChange={(e) => { setLogFilterAccion(e.target.value); setLogPage(1) }}
                  className="input-field w-52"
                >
                  <option value="">Todas las acciones</option>
                  {ACCION_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select
                  value={logFilterEntidad}
                  onChange={(e) => { setLogFilterEntidad(e.target.value); setLogPage(1) }}
                  className="input-field w-40"
                >
                  <option value="">Todas las entidades</option>
                  <option value="Gateway">Gateway</option>
                  <option value="Client">Cliente</option>
                  <option value="User">Usuario</option>
                </select>
                {(logFilterAccion || logFilterEntidad) && (
                  <button
                    onClick={() => { setLogFilterAccion(''); setLogFilterEntidad(''); setLogPage(1) }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Limpiar filtros
                  </button>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {logsData && (
                    <span className="text-xs text-muted-foreground">{logsData.total} eventos totales</span>
                  )}
                  <button
                    onClick={() => refetchLogs()}
                    disabled={logsFetching}
                    className="btn-secondary"
                  >
                    <RefreshCw className={`w-4 h-4 ${logsFetching ? 'animate-spin' : ''}`} />
                    Actualizar
                  </button>
                </div>
              </div>

              {/* Tabla */}
              {logsLoading ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Cargando registros...</span>
                </div>
              ) : !logsData?.items.length ? (
                <div className="glass-card p-12 text-center">
                  <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">Sin eventos registrados</h3>
                  <p className="text-sm text-muted-foreground">
                    Los eventos del sistema aparecerán aquí conforme se realicen acciones.
                  </p>
                </div>
              ) : (
                <div className="glass-card overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha / Hora</th>
                        <th>Evento</th>
                        <th>Entidad</th>
                        <th>Detalle</th>
                        <th>Usuario</th>
                        <th className="hidden md:table-cell">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logsData.items.map((log) => (
                        <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                          <td className="whitespace-nowrap">
                            <span className="text-xs font-mono text-muted-foreground">
                              {new Date(log.created_at).toLocaleString('es-EC', {
                                day: '2-digit', month: '2-digit', year: '2-digit',
                                hour: '2-digit', minute: '2-digit', second: '2-digit',
                              })}
                            </span>
                          </td>
                          <td><ActionBadge accion={log.accion} /></td>
                          <td>
                            {log.entidad_nombre ? (
                              <div>
                                <span className="text-xs font-medium text-foreground">{log.entidad_nombre}</span>
                                {log.entidad_tipo && (
                                  <span className="block text-[10px] text-muted-foreground">{log.entidad_tipo}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td><LogDetailCell detalle={log.detalle} /></td>
                          <td>
                            <span className="text-xs text-foreground font-medium">
                              {log.usuario_nombre ?? <span className="text-muted-foreground italic">Sistema</span>}
                            </span>
                          </td>
                          <td className="hidden md:table-cell">
                            <code className="text-[10px] text-muted-foreground font-mono">
                              {log.ip_address ?? '—'}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Paginación */}
              {logTotalPages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Página {logPage} de {logTotalPages} · {logsData?.total} registros
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLogPage((p) => Math.max(p - 1, 1))}
                      disabled={logPage === 1}
                      className="btn-secondary py-1.5 px-3 text-xs"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setLogPage((p) => Math.min(p + 1, logTotalPages))}
                      disabled={logPage === logTotalPages}
                      className="btn-secondary py-1.5 px-3 text-xs"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Modal Dialog: Crear / Editar Usuario ──────────────────────────────── */}
          {isUserModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="glass-card w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-brand-400" />
                    <span>{editingUser ? 'Editar Operador' : 'Registrar Nuevo Operador'}</span>
                  </h3>
                  <button
                    onClick={() => setIsUserModalOpen(false)}
                    className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmitUser((data) => userMutation.mutate(data))} className="flex-1 overflow-y-auto p-6 space-y-5">

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5" /> Datos Personales
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase block">Nombre Completo *</label>
                        <input type="text" {...registerUser('nombre')} className="input-field" placeholder="Geo Guncay" required />
                        {userErrors.nombre && <p className="text-xs text-destructive">{userErrors.nombre.message}</p>}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase block">Correo Electrónico *</label>
                        <input type="email" {...registerUser('email')} className="input-field" placeholder="geo@wisp.com" required />
                        {userErrors.email && <p className="text-xs text-destructive">{userErrors.email.message}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase block">
                          Contraseña {editingUser ? '(Dejar en blanco para mantener)' : '*'}
                        </label>
                        <input type="password" {...registerUser('password')} className="input-field" placeholder="••••••••" required={!editingUser} />
                        {userErrors.password && <p className="text-xs text-destructive">{userErrors.password.message}</p>}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase block">Tipo de Operador *</label>
                        <select {...registerUser('tipo_operador')} className="input-field">
                          <option value="administrador">Administrador</option>
                          <option value="operador_pagos">Operador de Pagos</option>
                          <option value="instalador">Instalador</option>
                          <option value="soporte_tecnico">Soporte Técnico</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <hr className="border-border/50" />

                  {/* Horario y Restricciones */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" /> Horario de Acceso
                    </h4>
                    <div className="grid grid-cols-2 gap-4 max-w-sm">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">Hora Inicio</label>
                        <input type="time" {...registerUser('horario_inicio')} className="input-field font-mono text-center" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">Hora Fin</label>
                        <input type="time" {...registerUser('horario_fin')} className="input-field font-mono text-center" />
                      </div>
                    </div>
                  </div>

                  <hr className="border-border/50" />

                  {/* Permisos de Router */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Router className="w-3.5 h-3.5" /> Permisos Router
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Asigna los routers específicos a los que este operador tendrá acceso.</p>
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-background/30 border border-border/50 max-h-[120px] overflow-y-auto">
                      {routers.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground py-0.5">
                          <div className="relative inline-flex items-center flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={selectedRouters.includes(r.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRouters([...selectedRouters, r.id])
                                } else {
                                  setSelectedRouters(selectedRouters.filter(id => id !== r.id))
                                }
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-[13px] after:w-[13px] after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                          </div>
                          <span>{r.nombre}</span>
                        </label>
                      ))}
                      {routers.length === 0 && (
                        <p className="text-xs text-muted-foreground col-span-2 text-center py-2">No hay routers registrados.</p>
                      )}
                    </div>
                  </div>

                  <hr className="border-border/50" />

                  {/* Permisos generales */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5" /> Permisos Operativos
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-background/30 border border-border/50">
                      {DISPONIBLE_PERMISOS.map((p) => (
                        <label key={p.value} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground py-0.5">
                          <div className="relative inline-flex items-center flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={selectedPermisos.includes(p.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPermisos([...selectedPermisos, p.value])
                                } else {
                                  setSelectedPermisos(selectedPermisos.filter(val => val !== p.value))
                                }
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-[13px] after:w-[13px] after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                          </div>
                          <span>{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setIsUserModalOpen(false)}
                      className="flex-1 bg-secondary/40 text-foreground border border-border hover:bg-secondary/70 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={userMutation.isPending}
                      className="flex-1 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20 disabled:opacity-50"
                    >
                      {userMutation.isPending ? (
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
          )}
        </div>
      </div>

      {/* ── Modal: Crear / Editar Sitio ───────────────────────────────────── */}
      <SiteFormModal
        open={siteModalOpen}
        onClose={() => setSiteModalOpen(false)}
        site={siteModalSite}
      />

      {/* ── Modal: Confirmar eliminación de sitio ─────────────────────────── */}
      {confirmDeleteSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-sm mx-4 animate-fade-in space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-destructive/10 text-destructive rounded-lg shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">¿Eliminar sitio?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Vas a eliminar el sitio <span className="font-semibold text-foreground">"{confirmDeleteSite.nombre}"</span>.
                  Los gateways asignados a este sitio quedarán sin sitio asignado.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteSite(null)}
                className="btn-secondary flex-1 justify-center"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteSiteMutation.isPending}
                onClick={() => {
                  deleteSiteMutation.mutate(confirmDeleteSite.id, {
                    onSuccess: () => setConfirmDeleteSite(null),
                  })
                }}
                className="btn-destructive flex-1 justify-center"
              >
                {deleteSiteMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Eliminando...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Eliminar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
