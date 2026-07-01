import { useMutation } from '@tanstack/react-query'
import { Wrench, Save, Loader2, DatabaseBackup } from 'lucide-react'
import { updateMaintenance, runManualBackup, type MaintenanceSettings } from '@/services/systemSettings'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

export function MaintenanceSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: MaintenanceSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateMaintenance,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración de mantenimiento guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar el mantenimiento.' })
    },
  })

  const backupMutation = useMutation({
    mutationFn: runManualBackup,
    onSuccess: (result) => {
      setStatusMessage({
        type: 'success',
        text: `Backup generado: ${result.filename} (${(result.size_bytes / 1024).toFixed(1)} KB).`,
      })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al generar el backup.' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Wrench className="w-5 h-5 text-brand-400" />
            Mantenimiento
          </h3>
          <p className="text-muted-foreground text-xs mt-1">
            Retención del log de auditoría y modo mantenimiento del sistema.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const target = e.currentTarget as any
            mutation.mutate({
              maint_audit_log_retention_days: parseInt(target.auditLogRetentionDays.value, 10),
              maint_maintenance_mode: target.maintenanceMode.checked,
              maint_maintenance_message: target.maintenanceMessage.value || null,
            })
          }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Retención del log de auditoría (días)</label>
              <input name="auditLogRetentionDays" type="number" min={1} max={3650} defaultValue={data.maint_audit_log_retention_days} className="input-field font-mono" />
            </div>
          </div>

          <hr className="border-border/50" />

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                <input name="maintenanceMode" type="checkbox" defaultChecked={data.maint_maintenance_mode} className="sr-only peer" />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
              </label>
              <div>
                <span className="text-sm font-medium text-foreground block">Modo mantenimiento</span>
                <span className="text-xs text-muted-foreground">Bloquea el acceso a operadores no administradores mientras está activo.</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Mensaje de mantenimiento</label>
              <input name="maintenanceMessage" type="text" maxLength={500} defaultValue={data.maint_maintenance_message ?? ''} className="input-field" placeholder="El sistema está en mantenimiento, intente más tarde." />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border/50">
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <DatabaseBackup className="w-5 h-5 text-brand-400" />
            Backup manual
          </h3>
          <p className="text-muted-foreground text-xs mt-1">
            Genera un respaldo de la base de datos en el disco del servidor. Requiere PostgreSQL.
          </p>
        </div>
        <button
          type="button"
          onClick={() => backupMutation.mutate()}
          disabled={backupMutation.isPending}
          className="btn-secondary"
        >
          {backupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
          {backupMutation.isPending ? 'Generando backup...' : 'Ejecutar backup ahora'}
        </button>
      </div>
    </div>
  )
}
