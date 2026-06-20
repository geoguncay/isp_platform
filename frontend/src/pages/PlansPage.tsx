/**
 * PlansPage — CRUD de Planes de ancho de banda.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2, Edit2, Zap, ArrowDown, ArrowUp, Loader2, DollarSign, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

interface Plan {
  id: string
  nombre: string
  velocidad_down_mbps: number
  velocidad_up_mbps: number
  precio: number
  created_at: string
  velocidad_down_kbps?: number
  velocidad_up_kbps?: number
  descripcion?: string
  impuestos?: number
  limit_at_down_kbps?: number | null
  limit_at_up_kbps?: number | null
  burst_threshold_down_kbps?: number | null
  burst_threshold_up_kbps?: number | null
  prioridad?: number | null
  address_list?: string | null
  parent?: string | null
  clientes_activos?: number
  clientes_suspendidos?: number
}

const planSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(120),
  descripcion: z.string().max(255).optional().or(z.literal('')),
  precio: z.coerce.number().min(0.01, 'Mínimo $0.01'),
  impuestos: z.coerce.number().min(0, 'No puede ser negativo').default(0),
  velocidad_down_kbps: z.coerce.number().min(1, 'Mínimo 1 Kbps'),
  velocidad_up_kbps: z.coerce.number().min(1, 'Mínimo 1 Kbps'),
  limit_at_down_kbps: z.coerce.number().min(0).optional().nullable().or(z.literal('').transform(() => null)),
  limit_at_up_kbps: z.coerce.number().min(0).optional().nullable().or(z.literal('').transform(() => null)),
  burst_threshold_down_kbps: z.coerce.number().min(0).optional().nullable().or(z.literal('').transform(() => null)),
  burst_threshold_up_kbps: z.coerce.number().min(0).optional().nullable().or(z.literal('').transform(() => null)),
  prioridad: z.coerce.number().min(1).max(8).default(8).optional().nullable(),
})

type PlanFormData = z.infer<typeof planSchema>

async function fetchPlans(): Promise<Plan[]> {
  const { data } = await api.get('/plans')
  return data
}

export function PlansPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const isAdmin = user?.rol === 'admin'

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)

  const { data: plans = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['plans'],
    queryFn: fetchPlans,
  })

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema) as any,
  })

  const watchDownKbps = watch('velocidad_down_kbps')
  const watchUpKbps = watch('velocidad_up_kbps')

  const formatKbpsHelper = (kbpsVal: any) => {
    const num = Number(kbpsVal)
    if (isNaN(num) || num <= 0) return '0 Mbps'
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)} Gbps`
    }
    return `${(num / 1000).toFixed(2)} Mbps`
  }

  const saveMutation = useMutation({
    mutationFn: async (data: PlanFormData) => {
      if (editingPlan) {
        await api.put(`/plans/${editingPlan.id}`, data)
      } else {
        await api.post('/plans', data)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setDialogOpen(false)
      setEditingPlan(null)
      reset()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Error al guardar el plan'
      setErrorMessage(msg)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/plans/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setConfirmDelete(null)
      setDeleteErrorMessage(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'No se puede eliminar este plan'
      setDeleteErrorMessage(msg)
    }
  })

  const openAddDialog = () => {
    setEditingPlan(null)
    setErrorMessage(null)
    reset({
      nombre: '',
      descripcion: '',
      precio: 15.0,
      impuestos: 15.0,
      velocidad_down_kbps: 20000,
      velocidad_up_kbps: 10000,
      limit_at_down_kbps: null,
      limit_at_up_kbps: null,
      burst_threshold_down_kbps: null,
      burst_threshold_up_kbps: null,
      prioridad: 8,
    })
    setDialogOpen(true)
  }

  const openEditDialog = (plan: Plan) => {
    setEditingPlan(plan)
    setErrorMessage(null)
    reset({
      nombre: plan.nombre,
      descripcion: plan.descripcion || '',
      precio: plan.precio,
      impuestos: plan.impuestos || 0,
      velocidad_down_kbps: plan.velocidad_down_kbps || (plan.velocidad_down_mbps * 1000),
      velocidad_up_kbps: plan.velocidad_up_kbps || (plan.velocidad_up_mbps * 1000),
      limit_at_down_kbps: plan.limit_at_down_kbps,
      limit_at_up_kbps: plan.limit_at_up_kbps,
      burst_threshold_down_kbps: plan.burst_threshold_down_kbps,
      burst_threshold_up_kbps: plan.burst_threshold_up_kbps,
      prioridad: plan.prioridad || 8,
    })
    setDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Cargando planes...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planes de Ancho de Banda</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Planes y perfiles de velocidad para asignación de ancho de banda y cobros.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          {isAdmin && (
            <button
              onClick={openAddDialog}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              Agregar plan
            </button>
          )}
        </div>
      </div>

      {/* Grid of plans */}
      {plans.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Sin planes registrados</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Agrega tu primer plan de internet para comenzar a registrar clientes.
          </p>
          {isAdmin && (
            <button onClick={openAddDialog} className="btn-primary mx-auto">
              <Plus className="w-4 h-4" />
              Agregar primer plan
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.id} className="glass-card p-5 relative overflow-hidden flex flex-col justify-between group hover:border-brand-500/30 transition-all duration-300">
              {/* Card Header */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-brand-900/30 rounded-lg flex items-center justify-center border border-brand-800/40">
                    <Zap className="w-5 h-5 text-brand-400" />
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-brand-400 font-mono">${Number(plan.precio).toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground block">/mes</span>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-foreground truncate mb-2">{plan.nombre}</h3>

                {/* Clientes Activos/Suspendidos */}
                <div className="grid grid-cols-2 gap-3 bg-secondary/35 p-3 rounded-lg border border-border/50 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-sm border border-emerald-500/15 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <p>Activos: {plan.clientes_activos ?? 0}</p>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-sm border border-amber-500/15 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <p>Suspendidos: {plan.clientes_suspendidos ?? 0}</p>
                    </span>
                  </div>
                </div>

                {/* Speeds */}
                <div className="grid grid-cols-2 gap-3 bg-secondary/35 p-3 rounded-lg border border-border/50 mb-6">
                  <div className="flex items-center gap-2">
                    <ArrowDown className="w-4 h-4 text-emerald-400" />
                    <div>
                      <p className="text-xs text-muted-foreground">Bajada</p>
                      <p className="text-sm font-semibold text-foreground font-mono">{plan.velocidad_down_mbps} Mbps</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowUp className="w-4 h-4 text-brand-400" />
                    <div>
                      <p className="text-xs text-muted-foreground">Subida</p>
                      <p className="text-sm font-semibold text-foreground font-mono">{plan.velocidad_up_mbps} Mbps</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-4 mt-2">
                  <button
                    onClick={() => openEditDialog(plan)}
                    className="btn-secondary py-1.5 px-3 text-xs"
                    title="Editar plan"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDelete(plan.id)
                      setDeleteErrorMessage(null)
                    }}
                    className="btn-destructive py-1.5 px-3 text-xs"
                    title="Eliminar plan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Add/Edit Plan */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-10">
          <div className="glass-card w-full max-w-2xl mx-4 animate-fade-in my-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editingPlan ? `Editar: ${editingPlan.nombre}` : 'Agregar Plan'}
              </h2>
              <button
                onClick={() => setDialogOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="p-5 space-y-6">
              {errorMessage && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs text-destructive">
                  {errorMessage}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Col 1: Configuración General */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-brand-400 border-b border-border pb-1.5 mb-3">
                    Configuración General
                  </h3>

                  {/* Nombre */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Nombre del Plan *</label>
                    <input
                      type="text"
                      placeholder="Plan Fibra Hogar 50 Mbps"
                      {...register('nombre')}
                      className="input-field"
                    />
                    {errors.nombre && <p className="text-xs text-destructive mt-1">{errors.nombre.message}</p>}
                  </div>

                  {/* Descripción */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Descripción</label>
                    <textarea
                      placeholder="Breve descripción del plan..."
                      {...register('descripcion')}
                      rows={3}
                      className="input-field resize-none py-2 text-sm"
                    />
                    {errors.descripcion && <p className="text-xs text-destructive mt-1">{errors.descripcion.message}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Precio */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Precio ($ USD) *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="19.99"
                          {...register('precio')}
                          className="input-field pl-7 font-mono text-sm"
                        />
                      </div>
                      {errors.precio && <p className="text-xs text-destructive mt-1">{errors.precio.message}</p>}
                    </div>

                    {/* Impuestos */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Impuestos (IVA %)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="15"
                          {...register('impuestos')}
                          className="input-field pr-7 font-mono text-sm"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">%</span>
                      </div>
                      {errors.impuestos && <p className="text-xs text-destructive mt-1">{errors.impuestos.message}</p>}
                    </div>
                  </div>
                </div>

                {/* Col 2: Configuración de Velocidad */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-brand-400 border-b border-border pb-1.5 mb-3">
                    Velocidad (MikroTik)
                  </h3>

                  {/* Down / Up Kbps */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Descarga (Kbps) *</label>
                      <input
                        type="number"
                        placeholder="50000"
                        {...register('velocidad_down_kbps')}
                        className="input-field font-mono text-sm"
                      />
                      <p className="text-[10px] text-brand-400 mt-1 font-mono">{formatKbpsHelper(watchDownKbps)}</p>
                      {errors.velocidad_down_kbps && <p className="text-xs text-destructive mt-1">{errors.velocidad_down_kbps.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Subida (Kbps) *</label>
                      <input
                        type="number"
                        placeholder="25000"
                        {...register('velocidad_up_kbps')}
                        className="input-field font-mono text-sm"
                      />
                      <p className="text-[10px] text-brand-400 mt-1 font-mono">{formatKbpsHelper(watchUpKbps)}</p>
                      {errors.velocidad_up_kbps && <p className="text-xs text-destructive mt-1">{errors.velocidad_up_kbps.message}</p>}
                    </div>
                  </div>

                  {/* Limit AT Down / Up Kbps */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Limit At Descarga (Kbps)</label>
                      <input
                        type="number"
                        placeholder="Opcional"
                        {...register('limit_at_down_kbps')}
                        className="input-field font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Limit At Subida (Kbps)</label>
                      <input
                        type="number"
                        placeholder="Opcional"
                        {...register('limit_at_up_kbps')}
                        className="input-field font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Burst Threshold Down / Up Kbps */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Burst Threshold Descarga (Kbps)</label>
                      <input
                        type="number"
                        placeholder="Opcional"
                        {...register('burst_threshold_down_kbps')}
                        className="input-field font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">Burst Threshold Subida (Kbps)</label>
                      <input
                        type="number"
                        placeholder="Opcional"
                        {...register('burst_threshold_up_kbps')}
                        className="input-field font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Prioridad */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Prioridad</label>
                    <select
                      {...register('prioridad')}
                      className="input-field text-sm"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((prio) => (
                        <option key={prio} value={prio} className="bg-background text-foreground">
                          {prio} {prio === 8 ? '(Mín)' : prio === 1 ? '(Máx)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-3 border-t border-border/50 pt-4">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="btn-primary flex-1 justify-center"
                >
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saveMutation.isPending ? 'Guardando...' : editingPlan ? 'Guardar cambios' : 'Agregar plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-sm mx-4 animate-fade-in">
            <h3 className="text-lg font-semibold text-foreground mb-2">¿Eliminar plan?</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Esta acción no se puede deshacer. Solo se podrá eliminar si el plan no está asignado a clientes activos.
            </p>

            {deleteErrorMessage && (
              <div className="p-3 mb-4 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs animate-fade-in">
                {deleteErrorMessage}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmDelete(null)
                  setDeleteErrorMessage(null)
                }}
                className="btn-secondary flex-1 justify-center"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete)}
                disabled={deleteMutation.isPending}
                className="btn-destructive flex-1 justify-center"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
