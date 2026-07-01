import { useMutation } from '@tanstack/react-query'
import { Shield, Save, Loader2 } from 'lucide-react'
import { updateSecurity, type SecuritySettings } from '@/services/systemSettings'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

export function SecuritySettingsForm({
  data, onSaved, setStatusMessage,
}: { data: SecuritySettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateSecurity,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración de seguridad guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la seguridad.' })
    },
  })

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-400" />
          Seguridad
        </h3>
        <p className="text-muted-foreground text-xs mt-1">
          Políticas de contraseñas, sesión y bloqueo de acceso para los operadores del sistema.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          const ipList = (target.ipWhitelist.value as string)
            .split(',')
            .map((v: string) => v.trim())
            .filter(Boolean)
          mutation.mutate({
            sec_password_min_length: parseInt(target.passwordMinLength.value, 10),
            sec_password_expiration_days: parseInt(target.passwordExpirationDays.value, 10),
            sec_default_session_timeout_minutes: parseInt(target.sessionTimeoutMinutes.value, 10),
            sec_max_login_attempts: parseInt(target.maxLoginAttempts.value, 10),
            sec_lockout_duration_minutes: parseInt(target.lockoutDurationMinutes.value, 10),
            sec_ip_whitelist: ipList,
          })
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Longitud mínima de contraseña</label>
            <input name="passwordMinLength" type="number" min={4} max={64} defaultValue={data.sec_password_min_length} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Expiración de contraseña (días)</label>
            <input name="passwordExpirationDays" type="number" min={0} defaultValue={data.sec_password_expiration_days} className="input-field font-mono" />
            <span className="text-[10px] text-muted-foreground block">0 = sin expiración.</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Tiempo de sesión por defecto (min)</label>
            <input name="sessionTimeoutMinutes" type="number" min={1} max={1440} defaultValue={data.sec_default_session_timeout_minutes} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Intentos fallidos permitidos</label>
            <input name="maxLoginAttempts" type="number" min={1} max={20} defaultValue={data.sec_max_login_attempts} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Duración de bloqueo (min)</label>
            <input name="lockoutDurationMinutes" type="number" min={1} max={1440} defaultValue={data.sec_lockout_duration_minutes} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Lista blanca de IPs (separadas por coma)</label>
            <input name="ipWhitelist" type="text" defaultValue={data.sec_ip_whitelist.join(', ')} className="input-field font-mono" placeholder="192.168.1.1, 10.0.0.0/24" />
            <span className="text-[10px] text-muted-foreground block">Dejar en blanco para permitir acceso desde cualquier IP.</span>
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
  )
}
